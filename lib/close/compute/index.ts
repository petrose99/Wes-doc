/** Close-item compute dispatcher (#96).
 *
 *   computeCloseItems({ closeId }) →
 *     for each open CloseItem on the close:
 *       - build the compute input once (bills, gates, period, pack)
 *       - dispatch to the per-kind computer
 *       - upsert `computedValue` + `computedAt` on the row
 *       - emit `close.item.computed` via writeAuditEvent — payload-hash idempotency in the
 *         audit helper means "logged only on value change" comes for free (per #42)
 *
 * Auto-compute-on-open is one call to this from lib/close/actions.ts::openClose right after
 * the Close + CloseItem rows land. A recompute action calls the same entry point.
 *
 * Never throws for a single item's compute failure: one broken kind must not stall the rest
 * of the checklist. The failing item keeps its prior `computedValue` (which may be null on a
 * fresh Close) and an error is logged. */

import { prisma } from "@/lib/db"
import { AuditEventType, writeAuditEvent } from "@/lib/audit"
import { resolveJurisdictionPack, type JurisdictionCode } from "@/lib/jurisdictions"
import type { Period } from "@/lib/jurisdictions/_shared/workpaper"
import type { CloseItem, Prisma, PrismaClient } from "@/prisma/client"

import type { CloseItemKind } from "../types"
import type { CloseCandidateBill } from "./bills"
import { loadCandidateBills } from "./bills"
import { computeBankRecon, BANK_RECON_DEFAULT_TOLERANCE } from "./bank-recon"
import { computeApAging } from "./ap-aging"
import { computeUnpostedAccruals } from "./unposted-accruals"
import { computeVatWorkpaper } from "./vat-workpaper"
import { computeCrossBorderReview } from "./cross-border-review"
import type { ComputedValue } from "./types"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export * from "./types"
export {
  loadCandidateBills,
  computeBankRecon,
  BANK_RECON_DEFAULT_TOLERANCE,
  computeApAging,
  computeUnpostedAccruals,
  computeVatWorkpaper,
  computeCrossBorderReview,
}

export type ComputeCloseItemsInput = {
  closeId: string
  /** Optional actor for the audit event. Null when the compute is triggered by
   * openClose / a scheduled recompute (no human in the loop). */
  actorId?: string | null
}

export type ComputeCloseItemsResult = {
  closeId: string
  items: {
    itemId: string
    kind: CloseItemKind
    changed: boolean
    error?: string
  }[]
}

/** Compute every item on the given Close in one pass. Idempotent by (kind, payload) —
 * running it twice back-to-back is safe and emits no duplicate audit events on the second
 * run (audit_events has UNIQUE(type, subject_id, payload_hash)). */
export async function computeCloseItems(
  input: ComputeCloseItemsInput,
  client: PrismaLike = prisma,
): Promise<ComputeCloseItemsResult> {
  const close = await client.close.findUnique({
    where: { id: input.closeId },
    include: { items: true },
  })
  if (!close) throw new Error(`Close ${input.closeId} not found`)

  const workspace = await client.workspace.findUnique({
    where: { id: close.workspaceId },
    select: {
      country: true,
      baseCurrency: true,
      jurisdictionCode: true,
      deferredVatScheme: true,
    },
  })
  if (!workspace) throw new Error(`Workspace ${close.workspaceId} not found`)

  const jurisdictionCode = (workspace.jurisdictionCode as JurisdictionCode | null) ?? null
  const pack = resolveJurisdictionPack(jurisdictionCode)

  const periodStart = new Date(Date.UTC(close.periodYear, close.periodMonth - 1, 1))
  const periodEnd = new Date(Date.UTC(close.periodYear, close.periodMonth, 0, 23, 59, 59, 999))
  const period: Period = {
    id: `${jurisdictionCode ?? "NA"}-${close.periodYear}-M${String(close.periodMonth).padStart(2, "0")}`,
    startDate: periodStart,
    endDate: periodEnd,
    workspaceBaseCurrency: workspace.baseCurrency,
  }

  const bills = await loadCandidateBills(
    {
      workspaceId: close.workspaceId,
      periodEnd,
      workspaceCountry: workspace.country,
      deferredVatScheme: workspace.deferredVatScheme,
    },
    client,
  )

  // One gate query at the top so aging / accruals share it — the accruals computer only
  // needs the presence-per-doc flag (already baked into `CloseCandidateBill.gateStatus`),
  // while aging surfaces workspace-wide counts + ids.
  const openGates = await client.gate.findMany({
    where: { workspaceId: close.workspaceId, state: "blocked" },
    select: { id: true, severity: true },
    orderBy: { firedAt: "asc" },
  })

  const results: ComputeCloseItemsResult["items"] = []
  for (const item of close.items) {
    try {
      const kind = item.kind as CloseItemKind
      const value = computeOne({
        kind,
        item,
        bills,
        openGates,
        pack,
        period,
        priorValue: item.computedValue as ComputedValue | null,
      })
      if (!value) {
        // Unknown kind — leave the item alone but record it as a no-op result.
        results.push({ itemId: item.id, kind, changed: false })
        continue
      }
      const changed = !isSamePayload(item.computedValue, value)
      await client.closeItem.update({
        where: { id: item.id },
        data: {
          computedValue: value as unknown as Prisma.InputJsonValue,
          computedAt: new Date(),
        },
      })
      if (changed) {
        await writeAuditEvent(
          {
            workspaceId: close.workspaceId,
            actorId: input.actorId ?? null,
            type: AuditEventType.CLOSE_ITEM_COMPUTED,
            subjectType: "close_item",
            subjectId: item.id,
            payload: value as unknown as Prisma.InputJsonValue,
          },
          client,
        )
      }
      results.push({ itemId: item.id, kind, changed })
    } catch (error) {
      // One kind's failure does not stall the pass.
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[close-compute] item ${item.id} (${item.kind}) failed: ${message}`)
      results.push({ itemId: item.id, kind: item.kind as CloseItemKind, changed: false, error: message })
    }
  }

  return { closeId: close.id, items: results }
}

function computeOne(args: {
  kind: CloseItemKind
  item: CloseItem
  bills: readonly CloseCandidateBill[]
  openGates: readonly { id: string; severity: string }[]
  pack: ReturnType<typeof resolveJurisdictionPack>
  period: Period
  priorValue: ComputedValue | null
}): ComputedValue | null {
  const { kind, item, bills, openGates, pack, period, priorValue } = args
  switch (kind) {
    case "bank-recon": {
      const prior = priorValue?.kind === "bank-recon" ? priorValue : null
      return computeBankRecon({
        priorAssertion: prior?.assertedBalance ?? null,
        computedBalance: prior?.computedBalance ?? null,
        tolerance: prior?.tolerance,
      })
    }
    case "ap-aging":
      return computeApAging({ periodEnd: period.endDate, bills, openGates })
    case "unposted-bill-accruals":
      return computeUnpostedAccruals({
        periodEnd: period.endDate,
        bills,
        jurisdictionCode: (pack?.code as JurisdictionCode | null) ?? null,
      })
    case "vat-workpaper":
      return computeVatWorkpaper({ pack, bills, period })
    case "cross-border-review":
      return computeCrossBorderReview({ bills, period })
    default:
      // Exhaustive check — a new CloseItemKind added upstream lands here until this switch
      // grows a branch. Return null so an unknown kind is a no-op, not a failure.
      void (item)
      return null
  }
}

/** Structural equality on the computedValue JSON. Deep enough to catch changed totals /
 * added rows without pulling in a whole diffing library — the audit helper's canonical
 * payload hash is authoritative for the trail; this function is only the "should I touch
 * the row at all" fast path. */
function isSamePayload(prior: unknown, next: unknown): boolean {
  if (prior === next) return true
  if (prior == null || next == null) return false
  try {
    return JSON.stringify(sortDeep(prior)) === JSON.stringify(sortDeep(next))
  } catch {
    return false
  }
}

function sortDeep(v: unknown): unknown {
  if (v == null || typeof v !== "object") return v
  if (Array.isArray(v)) return v.map(sortDeep)
  const rec = v as Record<string, unknown>
  return Object.fromEntries(Object.keys(rec).sort().map((k) => [k, sortDeep(rec[k])]))
}

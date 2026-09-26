/** Gate 3/6 from decision #40: 2/3-way match variance. Soft, workspace-tunable.
 *
 * Rule (from #40 + #53): if the arriving bill is linked to a PO (2-way) — and optionally a
 * GRN (3-way) — compare totals. When the largest pairwise gap exceeds the workspace
 * tolerance, fire a soft gate. Tolerance is `max(percent * anchor, floor.amount)` where
 * `anchor` is the PO total (the reference the bill is being matched against) and
 * `floor.amount` is workspace-currency, defaulting to 500. Percent seeds at 2%.
 *
 * "No PO" is NOT an exception — it is a data absence. A bill that has no PurchaseOrder
 * linked (through a `po_to_invoice` DocumentMatch) simply falls out of this gate silently:
 * two-way match requires a PO, three-way requires PO+GRN, and forcing a soft gate on every
 * PO-less bill would drown the exception queue on workspaces that don't run PO matching at
 * all. When a bill later gains a linked PO (matching pipeline finished, or the user
 * confirmed a suggestion), the caller should re-run this gate — hook is
 * `reevaluateMatchVarianceForDocument`.
 *
 * Testability: the runner takes both `findMatchLinks` (candidate PO/GRN lookup) and
 * `getTolerance` (workspace setting read) as deps, so unit tests build their own linked
 * documents and tolerance without mocking Prisma. The default export wires the real
 * DocumentMatch + WorkspaceAutomationConfig queries.
 *
 * Payload shape: `{ matchType: "2-way" | "3-way", variance, threshold, percent, floor,
 * anchorTotal, invoiceTotal, poDocumentId, grnDocumentId?, grnTotal? }`. `matchType`
 * identifies the family; `variance` is the largest pairwise gap the rule saw; `threshold`
 * is the computed tolerance (max of percent-of-anchor and floor). The UI reads
 * `matchType` + `variance` + `threshold` for the exception chip. */

import { prisma } from "@/lib/db"
import { resolveGate } from "@/lib/gates/actions"
import { isComparedLink, poLinkKind, rankPoLinks, REJECTED_MATCH_STATUS } from "@/lib/matching/po-link"
import { getCompanyCurrency } from "@/models/company-currency"
import type { GateContext, GateRunner, GateVerdict } from "./types"
import type { Prisma, PrismaClient, Gate, Document } from "@/prisma/client"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export const MATCH_VARIANCE_GATE_TYPE = "match-variance"

/** Workspace-tunable tolerance from `WorkspaceAutomationConfig.matchTolerance`. `floor.currency`
 * is optional — when omitted, the caller resolves it against `workspace.baseCurrency` at
 * evaluation time (so a base-currency change picks up without a data backfill). */
export type MatchTolerance = {
  percent: number
  floor: { amount: number; currency?: string }
}

export const DEFAULT_MATCH_TOLERANCE: MatchTolerance = {
  percent: 0.02,
  floor: { amount: 500 },
}

/** What the rule sees for one bill: the totals on the linked PO and (optionally) GRN. The
 * runner never fetches Prisma directly — the default `findMatchLinks` at the bottom of this
 * file does that; a synthetic test supplies its own list. */
export type MatchLink = {
  poDocumentId: string
  poTotal: number
  grnDocumentId?: string
  grnTotal?: number
}

export type FindMatchLinks = (ctx: GateContext) => Promise<MatchLink | null>
export type GetTolerance = (workspaceId: string, baseCurrency: string) => Promise<MatchTolerance>

export type MatchVarianceDeps = {
  findMatchLinks: FindMatchLinks
  getTolerance: GetTolerance
}

type FieldSnapshot = Record<string, unknown>

function isValues(value: unknown): value is FieldSnapshot {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/** The values the rule compares. An AP-inbound item carries them on `fieldSnapshot`; a document
 * that came through extraction keeps its *template* there (an array of field definitions) and
 * its values on `reviewedData` / `rawExtraction`, so those are read when the snapshot is not a
 * value map (#250 — the gate has to fire for a real invoice, not only an ingestion item). */
function readSnapshot(document: GateContext["document"]): FieldSnapshot {
  if (isValues(document.fieldSnapshot)) return document.fieldSnapshot
  if (isValues(document.reviewedData)) return document.reviewedData
  if (isValues(document.rawExtraction)) return document.rawExtraction
  return {}
}

function readNumber(snapshot: FieldSnapshot, key: string): number | null {
  const value = snapshot[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,\s]/g, ""))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Coerce whatever the JSON column carries into a MatchTolerance, silently falling back to
 * the seed on any missing / malformed field. Never throws — a bad row must never brick a
 * gate that would otherwise pass. */
export function coerceMatchTolerance(raw: unknown): MatchTolerance {
  if (!raw || typeof raw !== "object") return DEFAULT_MATCH_TOLERANCE
  const obj = raw as Record<string, unknown>
  const percent = typeof obj.percent === "number" && obj.percent >= 0 ? obj.percent : DEFAULT_MATCH_TOLERANCE.percent
  const floorRaw = obj.floor && typeof obj.floor === "object" ? (obj.floor as Record<string, unknown>) : {}
  const amount = typeof floorRaw.amount === "number" && floorRaw.amount >= 0 ? floorRaw.amount : DEFAULT_MATCH_TOLERANCE.floor.amount
  const currency = typeof floorRaw.currency === "string" && floorRaw.currency.length > 0 ? floorRaw.currency : undefined
  return { percent, floor: currency ? { amount, currency } : { amount } }
}

/** Pure — given anchor + candidates, return the variance and threshold. Anchor is the PO
 * total (the reference); variance is the largest gap between the anchor and the invoice
 * (and receipt, if 3-way). A tolerance of `max(percent * |anchor|, floor)` matches how the
 * existing matching engine already thinks about "close enough" (lib/matching/three-way.ts). */
export function computeVarianceVerdict(input: {
  invoiceTotal: number
  poTotal: number
  grnTotal?: number
  tolerance: MatchTolerance
}): { variance: number; threshold: number; withinTolerance: boolean } {
  const { invoiceTotal, poTotal, grnTotal, tolerance } = input
  const gaps = [Math.abs(invoiceTotal - poTotal)]
  if (grnTotal !== undefined && Number.isFinite(grnTotal)) {
    gaps.push(Math.abs(invoiceTotal - grnTotal))
    gaps.push(Math.abs(poTotal - grnTotal))
  }
  const variance = Math.max(...gaps)
  const threshold = Math.max(Math.abs(poTotal) * tolerance.percent, tolerance.floor.amount)
  return { variance, threshold, withinTolerance: variance <= threshold }
}

export function createMatchVarianceGateRunner(deps: MatchVarianceDeps): GateRunner {
  return {
    gateType: MATCH_VARIANCE_GATE_TYPE,
    async run(ctx): Promise<GateVerdict> {
      // Only bills — POs and GRNs don't get run against themselves.
      if (ctx.document.docType !== "invoice") return { blocked: false }

      const snapshot = readSnapshot(ctx.document)
      const invoiceTotal = readNumber(snapshot, "total")
      // Without a total on the bill there's nothing to compare against — silently pass. The
      // extraction pipeline is expected to fill `total`; if it never does, that's a
      // different gate's problem (confidence-band).
      if (invoiceTotal === null) return { blocked: false }

      const link = await deps.findMatchLinks(ctx)
      // No linked PO ⇒ data absence, not an exception. See file header.
      if (!link) return { blocked: false }
      if (!Number.isFinite(link.poTotal)) return { blocked: false }

      const baseCurrency = ctx.baseCurrency
      const tolerance = await deps.getTolerance(ctx.workspaceId, baseCurrency)
      // A tolerance object whose floor is 0 AND percent is 0 would mean "no tolerance ever",
      // but the seed defends against that shape; still, if a workspace explicitly writes
      // { percent: 0, floor: { amount: 0 } } we honor it — that's the "strict matching"
      // opt-in the ticket calls out ("do NOT let it default to 0").

      const verdict = computeVarianceVerdict({
        invoiceTotal,
        poTotal: link.poTotal,
        grnTotal: link.grnTotal,
        tolerance,
      })
      if (verdict.withinTolerance) return { blocked: false }

      const matchKind: "2-way" | "3-way" = link.grnDocumentId ? "3-way" : "2-way"
      const floorCurrency = tolerance.floor.currency ?? baseCurrency
      return {
        blocked: true,
        severity: "soft",
        payload: {
          matchType: matchKind,
          variance: verdict.variance,
          threshold: verdict.threshold,
          percent: tolerance.percent,
          floor: { amount: tolerance.floor.amount, currency: floorCurrency },
          anchorTotal: link.poTotal,
          invoiceTotal,
          poDocumentId: link.poDocumentId,
          ...(link.grnDocumentId ? { grnDocumentId: link.grnDocumentId, grnTotal: link.grnTotal } : {}),
        },
      }
    },
  }
}

/** Real-DB link lookup: the highest-confidence PO linked to this invoice through
 * DocumentMatch, and (optionally) the highest-confidence receipt linked to it. Both queries
 * are scoped to the workspace. When no linked PO exists, returns null (the runner's silent
 * pass-through). GRN is best-effort — a 3-way match requires both, but a bill that has PO
 * but no GRN is still a valid 2-way match. */
async function findMatchLinksInDb(ctx: GateContext, client: PrismaLike = prisma): Promise<MatchLink | null> {
  // po_to_invoice: source is PO, target is invoice. #228 Q11: only a *compared* link (confirmed,
  // or the matcher's guess when the invoice cites the same PO number) anchors the gate — a
  // suggestion the reviewer has not confirmed compares nothing, and a rejected link is gone.
  const invoiceSnapshot = readSnapshot(ctx.document)
  const invoicePoNumber = [invoiceSnapshot.po_number, invoiceSnapshot.purchase_order_number].find((value): value is string => typeof value === "string" && value.length > 0) ?? null
  const poMatches = await client.documentMatch.findMany({
    where: { workspaceId: ctx.workspaceId, targetId: ctx.documentId, matchType: "po_to_invoice", status: { not: REJECTED_MATCH_STATUS } },
    select: { sourceId: true, status: true, confidence: true, source: { select: { fieldSnapshot: true, reviewedData: true, rawExtraction: true } } },
  })
  const poMatch = rankPoLinks(poMatches.map((row) => {
    const snapshot = readSnapshot(row.source as GateContext["document"])
    const poNumber = typeof snapshot.po_number === "string" && snapshot.po_number.length ? snapshot.po_number : null
    return { row, confidence: row.confidence, kind: poLinkKind({ status: row.status, invoicePoNumber, poNumber }) }
  })).filter((link) => isComparedLink(link.kind))[0]?.row
  if (!poMatch) return null
  const poSnapshot = readSnapshot(poMatch.source as GateContext["document"])
  const poTotalRaw = poSnapshot.total ?? poSnapshot.amount
  const poTotal = typeof poTotalRaw === "number" ? poTotalRaw
    : typeof poTotalRaw === "string" ? Number(poTotalRaw.replace(/[,\s]/g, "")) : NaN
  if (!Number.isFinite(poTotal)) return null

  // invoice_to_receipt: source is invoice, target is receipt.
  const grnMatch = await client.documentMatch.findFirst({
    where: { workspaceId: ctx.workspaceId, sourceId: ctx.documentId, matchType: "invoice_to_receipt" },
    orderBy: { confidence: "desc" },
    select: { targetId: true, target: { select: { fieldSnapshot: true, reviewedData: true, rawExtraction: true } } },
  })
  let grnDocumentId: string | undefined
  let grnTotal: number | undefined
  if (grnMatch) {
    const grnSnapshot = readSnapshot(grnMatch.target as GateContext["document"])
    const grnRaw = grnSnapshot.total ?? grnSnapshot.amount
    const parsed = typeof grnRaw === "number" ? grnRaw
      : typeof grnRaw === "string" ? Number(grnRaw.replace(/[,\s]/g, "")) : NaN
    if (Number.isFinite(parsed)) {
      grnDocumentId = grnMatch.targetId
      grnTotal = parsed
    }
  }
  return { poDocumentId: poMatch.sourceId, poTotal, grnDocumentId, grnTotal }
}

async function getWorkspaceMatchTolerance(workspaceId: string, _baseCurrency: string, client: PrismaLike = prisma): Promise<MatchTolerance> {
  const config = await client.workspaceAutomationConfig.findUnique({
    where: { workspaceId },
    select: { matchTolerance: true },
  })
  return coerceMatchTolerance(config?.matchTolerance ?? null)
}

/** The runner registered into gateRegistry. */
export const matchVarianceGateRunner: GateRunner = createMatchVarianceGateRunner({
  findMatchLinks: (ctx) => findMatchLinksInDb(ctx),
  getTolerance: (workspaceId, baseCurrency) => getWorkspaceMatchTolerance(workspaceId, baseCurrency),
})

/** Re-run the match-variance gate for one document, auto-resolving an open gate whose
 * variance now sits inside tolerance and firing a fresh one whose variance now sits
 * outside. Called from two places:
 *
 *   1) `reevaluateOpenMatchVarianceGates(workspaceId)` — the workspace-wide sweep the
 *      settings action calls when the tolerance JSON changes (ticket DoD: "Tolerance change
 *      on workspace settings retroactively re-evaluates open exceptions").
 *   2) A later hook when matching creates a new DocumentMatch — a bill that had no PO
 *      linked at arrival can gain one, and this walks the newly-linked bill through the
 *      rule without waiting for a re-upload.
 *
 * A workspace-wide re-eval that also flips previously-passing bills into new exceptions is
 * out of scope for #53 (the ticket's DoD scopes it to "open exceptions"): tightening the
 * knob shouldn't retroactively fault every clean bill in the workspace. If we later want
 * that flip too, this helper is the seam. */
export async function reevaluateMatchVarianceForDocument(
  input: { workspaceId: string; documentId: string },
  client: PrismaLike = prisma,
): Promise<{ outcome: "resolved" | "still-blocking" | "no-op" }> {
  const gate = await client.gate.findUnique({
    where: { documentId_gateType: { documentId: input.documentId, gateType: MATCH_VARIANCE_GATE_TYPE } },
  })
  if (!gate) return { outcome: "no-op" }
  if (gate.state !== "blocked") return { outcome: "no-op" }

  const doc = await client.document.findUnique({
    where: { id: input.documentId },
    select: { id: true, workspaceId: true, docType: true, fieldSnapshot: true, reviewedData: true, rawExtraction: true, receivedAt: true },
  })
  if (!doc) return { outcome: "no-op" }
  const verdict = await matchVarianceGateRunner.run({
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    document: doc as GateContext["document"],
    baseCurrency: await getCompanyCurrency(input.workspaceId, client),
  })
  if (!verdict.blocked) {
    await resolveGate(
      { gateId: gate.id, actorId: null, reason: "match tolerance change re-evaluated" },
      client,
    )
    return { outcome: "resolved" }
  }
  // Still blocking — refresh the payload so the exception chip shows the current variance
  // against the new threshold. Upsert path in the registry writes the same shape.
  await client.gate.update({
    where: { id: gate.id },
    data: {
      severity: verdict.severity,
      payload: (verdict.payload ?? null) as Prisma.InputJsonValue,
    },
  })
  return { outcome: "still-blocking" }
}

/** Workspace-wide sweep. Called from the settings server action after the tolerance JSON
 * changes; walks every open match-variance gate and either resolves or refreshes it. */
export async function reevaluateOpenMatchVarianceGates(
  workspaceId: string,
  client: PrismaLike = prisma,
): Promise<{ resolved: number; stillBlocking: number }> {
  const rows = await client.gate.findMany({
    where: { workspaceId, gateType: MATCH_VARIANCE_GATE_TYPE, state: "blocked" },
    select: { id: true, documentId: true },
  })
  let resolved = 0
  let stillBlocking = 0
  for (const row of rows) {
    const { outcome } = await reevaluateMatchVarianceForDocument({ workspaceId, documentId: row.documentId }, client)
    if (outcome === "resolved") resolved += 1
    else if (outcome === "still-blocking") stillBlocking += 1
  }
  return { resolved, stillBlocking }
}

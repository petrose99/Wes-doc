/** Gate 1/6 from decision #40: the duplicate gate. Hard, always blocks, fires on arrival.
 *
 * Rule (from #40): same supplier AND (same invoice-number OR same total + issue-date within
 * ±3 days) ⇒ duplicate. The invoice-number branch is the strong signal — providers re-issue
 * the same reference for the same bill; the total-and-date branch catches the "invoice
 * number lost to OCR" case, where a re-scan produces a different reference string but the
 * same money on the same day. Everything else falls through to the soft near-dupe check
 * that already lives in lib/checks/duplicates.ts.
 *
 * Supplier equality uses the normalized supplier name (lib/suppliers/normalize.ts), not
 * supplierId — resolveSupplier runs after ingestion, so at the moment the gate fires we
 * only have the extracted vendor string. That is fine for the rule: two bills whose
 * vendor strings normalize to the same key are, for the "is this the same paper" question,
 * from the same supplier.
 *
 * Testability: the runner is a factory over a `findCandidates` async, so the tests build
 * their own list and never mock Prisma. The default export wires the real query. */

import { prisma } from "@/lib/db"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"
import { normalizeInvoiceNumber } from "@/lib/checks/duplicates"
import { resolveGate } from "@/lib/gates/actions"
import type { Prisma, PrismaClient } from "@/prisma/client"
import type { GateContext, GateRunner, GateVerdict } from "./types"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export const DUPLICATE_GATE_TYPE = "duplicate"
export const DUPLICATE_DATE_TOLERANCE_DAYS = 3

/** Enough of a document to run the rule over. Kept narrow: the query in the default
 * factory selects exactly these fields, and the tests build these directly. */
export type DuplicateCandidate = {
  id: string
  fieldSnapshot: Record<string, unknown> | null | undefined
}

type FindCandidates = (ctx: GateContext) => Promise<DuplicateCandidate[]>

type FieldSnapshot = Record<string, unknown>

function readSnapshot(document: GateContext["document"]): FieldSnapshot {
  const snapshot = document.fieldSnapshot
  return (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot))
    ? (snapshot as FieldSnapshot)
    : {}
}

function readString(snapshot: FieldSnapshot, key: string): string | null {
  const value = snapshot[key]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
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

function readDate(snapshot: FieldSnapshot, key: string): Date | null {
  const value = snapshot[key]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function daysApart(a: Date, b: Date): number {
  return Math.abs((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000))
}

export function createDuplicateGateRunner(deps: { findCandidates: FindCandidates }): GateRunner {
  return {
    gateType: DUPLICATE_GATE_TYPE,
    async run(ctx): Promise<GateVerdict> {
      // Only run on documents whose docType makes "duplicate bill" a coherent question at
      // all. A bank statement or a receipt is not a bill; running the rule over them just
      // burns a query for no possible match. docType is nullable on legacy rows — those
      // fall through too, which is the safer of the two defaults.
      if (ctx.document.docType !== "invoice") return { blocked: false }

      const snapshot = readSnapshot(ctx.document)
      const rawSupplier = readString(snapshot, "vendor")
      const supplier = normalizeSupplierName(rawSupplier)
      // Without a supplier the rule has nothing to anchor "same paper" on. That is the one
      // hard prerequisite — either branch (invoice-number or total+date) needs it.
      if (!supplier) return { blocked: false }

      const rawInvoiceNumber = readString(snapshot, "invoice_number")
      const invoiceNumber = normalizeInvoiceNumber(rawInvoiceNumber)
      const total = readNumber(snapshot, "total")
      const issueDate = readDate(snapshot, "issue_date")

      const hasInvoiceBranch = invoiceNumber.length > 0
      const hasTotalDateBranch = total !== null && issueDate !== null
      if (!hasInvoiceBranch && !hasTotalDateBranch) return { blocked: false }

      const candidates = await deps.findCandidates(ctx)
      for (const other of candidates) {
        if (other.id === ctx.documentId) continue
        const otherSnapshot = (other.fieldSnapshot && typeof other.fieldSnapshot === "object" && !Array.isArray(other.fieldSnapshot))
          ? (other.fieldSnapshot as FieldSnapshot) : {}
        const otherSupplier = normalizeSupplierName(readString(otherSnapshot, "vendor"))
        if (otherSupplier !== supplier) continue

        // Branch 1 — same normalized invoice number wins immediately. Providers reuse
        // references verbatim across re-sends; this is the least-noisy signal.
        if (hasInvoiceBranch) {
          const otherInvoiceNumber = normalizeInvoiceNumber(readString(otherSnapshot, "invoice_number"))
          if (otherInvoiceNumber && otherInvoiceNumber === invoiceNumber) {
            return {
              blocked: true,
              severity: "hard",
              payload: {
                matchedDocumentId: other.id,
                reason: "invoice_number",
                invoiceNumber: rawInvoiceNumber,
              },
            }
          }
        }

        // Branch 2 — same total on the same day (±3d). Only checked when both sides carry
        // both facts; a missing total or missing date on either side lets the rule pass to
        // the next candidate rather than block on a partial match.
        if (hasTotalDateBranch) {
          const otherTotal = readNumber(otherSnapshot, "total")
          const otherDate = readDate(otherSnapshot, "issue_date")
          if (otherTotal !== null && otherDate !== null && otherTotal === total) {
            if (daysApart(issueDate!, otherDate) <= DUPLICATE_DATE_TOLERANCE_DAYS) {
              return {
                blocked: true,
                severity: "hard",
                payload: {
                  matchedDocumentId: other.id,
                  reason: "total_and_date",
                  total,
                  issueDate: issueDate!.toISOString(),
                },
              }
            }
          }
        }
      }
      return { blocked: false }
    },
  }
}

/** Real-DB candidate lookup: every other invoice in this workspace, taking the two fields
 * the rule reads and nothing else. The workspace scope + docType filter keep the row-count
 * bounded by "invoices in this workspace" rather than "everything ever"; a 1000-row cap
 * guards the pathological workspace where a scheduled ingest has been paused for months.
 * If that cap is ever hit in the wild the rule needs to switch to an indexed pre-filter
 * (supplier-normalized + date-window), but for the v1 rule shape it is the simpler shape. */
async function findCandidatesInDb(ctx: GateContext, client: PrismaLike = prisma): Promise<DuplicateCandidate[]> {
  const rows = await client.document.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      docType: "invoice",
      id: { not: ctx.documentId },
    },
    select: { id: true, fieldSnapshot: true },
    orderBy: { receivedAt: "desc" },
    take: 1000,
  })
  return rows.map((r) => ({ id: r.id, fieldSnapshot: r.fieldSnapshot as FieldSnapshot | null }))
}

/** The runner registered into gateRegistry by lib/gates/index.ts. */
export const duplicateGateRunner: GateRunner = createDuplicateGateRunner({
  findCandidates: (ctx) => findCandidatesInDb(ctx),
})

/** Auto-resolve hook: called from deleteWorkspaceDocuments before the delete tx. A
 * duplicate gate whose payload.matchedDocumentId is the bill being deleted has lost its
 * counterpart — the "winning" bill is gone, so the "blocked" bill is no longer a
 * duplicate of anything. Transition every such gate to resolved with a system audit event
 * (actorId null; the underlying condition, not a person, closed it).
 *
 * A gate ALREADY resolved or overridden is skipped — resolveGate is idempotent for the
 * resolved case, and re-resolving an overridden gate would rewrite an intentional human
 * decision. */
export async function resolveDuplicateGatesAgainst(
  deletedDocumentId: string,
  client: PrismaLike = prisma,
): Promise<{ resolved: number }> {
  const affected = await client.gate.findMany({
    where: {
      gateType: DUPLICATE_GATE_TYPE,
      state: "blocked",
      payload: { path: ["matchedDocumentId"], equals: deletedDocumentId },
    },
    select: { id: true },
  })
  for (const gate of affected) {
    await resolveGate(
      { gateId: gate.id, actorId: null, reason: `matched document ${deletedDocumentId} deleted` },
      client,
    )
  }
  return { resolved: affected.length }
}

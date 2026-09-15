/** Query helper for #203 (Override Mode): which gates are still open (`state: "blocked"`) against
 * a document, and whether each one is eligible for the manual Override control at all.
 *
 * Nothing in lib/gates previously listed Gate rows for UI consumption — every existing reader
 * (smb-ceiling's reevaluate loop, match-variance's resolve loop, etc.) queries for its own
 * gateType only, scoped to a reconciliation job, never "every open gate on this document" for a
 * screen. This is the first such reader, so it lives here rather than bolted onto one of those.
 *
 * Kept gate-verdict-shape-in, UI-shape-out: callers get plain serializable fields (no Prisma
 * `Gate` type leaking into components), and `overrideEligibility` is pure so the hard/soft
 * decision behind the Override control's disabled state is unit-testable without a database. */

import { prisma } from "@/lib/db"
import type { Prisma, PrismaClient } from "@/prisma/client"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export type OpenGateSummary = {
  id: string
  documentId: string
  gateType: string
  severity: "hard" | "soft"
  firedAt: Date
  payload: Record<string, unknown> | null
}

/** The read-only-hard-gate rule from #40/#51 (PR #109), reapplied at this query-helper layer so
 * every UI surface that lists gates asks the same question the same way, instead of re-deriving
 * `severity === "hard"` inline per surface (and risking a stray truthy string slipping through).
 * Generic across all three current hard gates (duplicate, jurisdiction-validity, smb-ceiling) —
 * naming them in the copy rather than leaving it abstract, since that is what #203 asks a disabled
 * control to say instead of just appearing greyed out. */
export const HARD_GATE_OVERRIDE_REFUSAL_REASON =
  "Duplicate, jurisdiction, and SMB-ceiling checks can't be overridden — resolve the underlying issue instead."

export type GateOverrideEligibility = { overridable: true } | { overridable: false; reason: string }

export function overrideEligibility(severity: string): GateOverrideEligibility {
  if (severity === "hard") return { overridable: false, reason: HARD_GATE_OVERRIDE_REFUSAL_REASON }
  return { overridable: true }
}

function toSummary(row: { id: string; documentId: string; gateType: string; severity: string; firedAt: Date; payload: unknown }): OpenGateSummary {
  return {
    id: row.id,
    documentId: row.documentId,
    gateType: row.gateType,
    // The column is a plain string (see prisma/schema.prisma::Gate.severity), not a Prisma enum —
    // narrowed here so every caller downstream works with the same two-value union the rest of
    // lib/gates already uses (GateVerdict["severity"] in ./types.ts).
    severity: row.severity === "hard" ? "hard" : "soft",
    firedAt: row.firedAt,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
  }
}

/** Every open gate against one document, oldest first (the order a gate would have fired in). */
export async function listOpenGatesForDocument(workspaceId: string, documentId: string, client: PrismaLike = prisma): Promise<OpenGateSummary[]> {
  const rows = await client.gate.findMany({
    where: { workspaceId, documentId, state: "blocked" },
    orderBy: { firedAt: "asc" },
    select: { id: true, documentId: true, gateType: true, severity: true, firedAt: true, payload: true },
  })
  return rows.map(toSummary)
}

/** The same read across a batch of documents, grouped by documentId — for a list screen that
 * needs to know which rows have open gates without one query per row. Documents with no open
 * gates are simply absent from the returned map rather than present with an empty array, so a
 * caller's `.get(id)?.length` check reads naturally as "none". */
export async function listOpenGatesForDocuments(workspaceId: string, documentIds: string[], client: PrismaLike = prisma): Promise<Map<string, OpenGateSummary[]>> {
  if (documentIds.length === 0) return new Map()
  const rows = await client.gate.findMany({
    where: { workspaceId, documentId: { in: documentIds }, state: "blocked" },
    orderBy: { firedAt: "asc" },
    select: { id: true, documentId: true, gateType: true, severity: true, firedAt: true, payload: true },
  })
  const byDocument = new Map<string, OpenGateSummary[]>()
  for (const row of rows) {
    const summary = toSummary(row)
    const existing = byDocument.get(summary.documentId)
    if (existing) existing.push(summary); else byDocument.set(summary.documentId, [summary])
  }
  return byDocument
}

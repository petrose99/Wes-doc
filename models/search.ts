// Deliberately NOT a "use server" module: search-actions.ts does the auth, this trusts the
// workspaceId it is handed (same convention as models/bills.ts).
import { prisma } from "@/lib/db"
import { processingState, type ProcessingState } from "@/lib/documents/processing-state"
import { resolveDocType, DOC_TYPE_SPECS, SEARCH_FIELD_KEYS, type DocType } from "@/lib/doc-types"
import { runGlobalSearch } from "@/lib/library-search"

/** #270 §1: Search's own predicate — every `Document` in the workspace, every `processingState()`,
 * `archivedAt` included. Deliberately NOT `LIBRARY_WHERE`/`models/library-facets.ts`, which drops
 * non-`reviewed` and archived rows (the #239 P0 this replaces). */
export type SearchFilters = {
  q?: string
  type?: string[]
  /** The five `ProcessingState` keys plus `"archived"` (lib/queue/filters.ts::statusFacet). */
  status?: string[]
  supplier?: string
  dateFrom?: string
  dateTo?: string
}

export type SearchRow = {
  id: string
  documentId: string
  filename: string
  docType: DocType
  typeLabel: string
  supplier: string | null
  number: string | null
  date: Date | null
  amount: number | null
  currencyCode: string | null
  processingState: ProcessingState
  archived: boolean
  /** Plain check-icon Ledger mark (spec §1: "reuse PoChip's ledger dot if present, else a plain
   * check icon" — no PoChip today since #344 hasn't landed). Null renders no mark. */
  ledgerMark: "posted" | "paid" | null
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(n) ? n : null
  }
  return null
}
function asDate(v: unknown): Date | null {
  if (typeof v !== "string") return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** §1: "No rows render until `q` is non-empty or a facet is selected" — a list precondition, not
 * an empty-result state, so the gate below returns with no DB call at all rather than querying and
 * discarding zero rows. */
function hasAnyFilter(filters: SearchFilters): boolean {
  return !!(filters.q?.trim() || filters.type?.length || filters.status?.length || filters.supplier?.trim() || filters.dateFrom || filters.dateTo)
}

export async function searchWorkspaceDocuments(workspaceId: string, filters: SearchFilters, actorId: string): Promise<{ rows: SearchRow[]; total: number }> {
  if (!hasAnyFilter(filters)) return { rows: [], total: 0 }

  const q = (filters.q ?? "").trim()
  let candidateIds: string[] | null = null
  if (q) {
    const { items } = await runGlobalSearch(workspaceId, q, actorId)
    candidateIds = [...new Set(items.map((item) => item.documentId))]
    if (!candidateIds.length) return { rows: [], total: 0 }
  }

  // ponytail: the Type facet filters on the `docType` column directly, not the legacy
  // template-code bridge `listWorkspaceDocuments` applies for its single-type filter — a
  // pre-classification document falls under "other" here instead. Upgrade if that undercounts.
  const documents = await prisma.document.findMany({
    where: {
      workspaceId,
      ...(candidateIds ? { id: { in: candidateIds } } : {}),
      ...(filters.type?.length ? { docType: { in: filters.type } } : {}),
      ...((filters.dateFrom || filters.dateTo) ? {
        receivedAt: {
          ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
          ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
        },
      } : {}),
    },
    select: {
      id: true, filename: true, docType: true, template: { select: { code: true } }, status: true,
      cancelledAt: true, archivedAt: true, receivedAt: true, reviewedData: true, rawExtraction: true, paymentStatus: true,
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  })
  if (!documents.length) return { rows: [], total: 0 }
  const documentIds = documents.map((d) => d.id)

  const [openCheckTasks, latestReviewTasks, touchlessEvents, openEscalations, succeededPushes] = await Promise.all([
    prisma.reviewTask.findMany({ where: { workspaceId, documentId: { in: documentIds }, reason: "check_failed", status: { in: ["open", "in_review"] } }, select: { documentId: true } }),
    prisma.reviewTask.findMany({ where: { workspaceId, documentId: { in: documentIds } }, select: { documentId: true, status: true }, orderBy: { createdAt: "desc" } }),
    prisma.documentAuditEvent.findMany({ where: { workspaceId, documentId: { in: documentIds }, type: "push.touchless_enqueued" }, select: { documentId: true } }),
    prisma.documentCheckResult.findMany({ where: { workspaceId, documentId: { in: documentIds }, status: "escalated", OR: [{ escalationStatus: null }, { escalationStatus: { in: ["open", "in_review"] } }] }, select: { documentId: true } }),
    prisma.integrationPush.findMany({ where: { workspaceId, documentId: { in: documentIds }, status: "succeeded" }, select: { documentId: true } }),
  ])

  const blockedIds = new Set(openCheckTasks.map((t) => t.documentId))
  const touchlessIds = new Set(touchlessEvents.map((e) => e.documentId))
  const escalatedIds = new Set(openEscalations.map((e) => e.documentId))
  const postedIds = new Set(succeededPushes.map((p) => p.documentId))
  // Newest-first query already orders latestReviewTasks, so the first hit per document is its
  // most recent ReviewTask of any reason (same "first wins" trick as models/bills.ts).
  const latestStatusByDoc = new Map<string, string>()
  for (const task of latestReviewTasks) if (!latestStatusByDoc.has(task.documentId)) latestStatusByDoc.set(task.documentId, task.status)

  let rows: SearchRow[] = documents.map((doc) => {
    const docType = resolveDocType(doc)
    const fieldKeys = SEARCH_FIELD_KEYS[docType]
    const values = (doc.reviewedData ?? doc.rawExtraction ?? {}) as Record<string, unknown>
    const latestStatus = latestStatusByDoc.get(doc.id)
    const approvalStatus: "not_started" | "in_progress" | "approved" | "rejected" | "cancelled" =
      doc.cancelledAt ? "cancelled" :
      latestStatus === "rejected" ? "rejected" :
      latestStatus === "in_review" ? "in_progress" :
      latestStatus === "open" ? "not_started" :
      "approved"
    const state = processingState({
      approvalStatus, blockedByCheck: blockedIds.has(doc.id), escalated: escalatedIds.has(doc.id),
      touchless: touchlessIds.has(doc.id), status: doc.status,
    })
    return {
      id: doc.id,
      documentId: doc.id,
      filename: doc.filename,
      docType,
      typeLabel: DOC_TYPE_SPECS[docType].label,
      supplier: fieldKeys.supplier ? asString(values[fieldKeys.supplier]) : null,
      number: fieldKeys.number ? asString(values[fieldKeys.number]) : null,
      date: fieldKeys.date ? asDate(values[fieldKeys.date]) : null,
      amount: fieldKeys.amount ? asNumber(values[fieldKeys.amount]) : null,
      currencyCode: asString(values["currency_code"]),
      processingState: state,
      archived: !!doc.archivedAt,
      ledgerMark: doc.paymentStatus === "paid" ? "paid" : postedIds.has(doc.id) ? "posted" : null,
    }
  })

  if (filters.supplier?.trim()) {
    const needle = filters.supplier.trim().toLowerCase()
    rows = rows.filter((row) => row.supplier?.toLowerCase().includes(needle))
  }
  if (filters.status?.length) {
    const wantArchived = filters.status.includes("archived")
    const wantStates = new Set(filters.status.filter((s) => s !== "archived"))
    rows = rows.filter((row) => (wantArchived && row.archived) || wantStates.has(row.processingState))
  }

  if (candidateIds) {
    const rank = new Map(candidateIds.map((id, i) => [id, i]))
    rows.sort((a, b) => (rank.get(a.documentId) ?? Infinity) - (rank.get(b.documentId) ?? Infinity))
  }

  return { rows, total: rows.length }
}

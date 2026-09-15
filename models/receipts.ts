// Deliberately NOT a "use server" module, matching models/bills.ts: server actions live upstream
// and do the auth. This trusts the workspaceId it is handed.
import { prisma } from "@/lib/db"

/** #212: Receipts cockpit, the Receipts counterpart to models/bills.ts's Invoices projection. One
 * row per Document whose type resolves to "receipt" (covers both the plain "receipt" template and
 * "expense_receipt", per lib/doc-types.ts's docType grouping) — supplier-paid purchases with no
 * AP aging or payment run, so this stays a plain read/claim-state cockpit, not a bills clone. */

export type ReceiptRow = {
  documentId: string
  filename: string
  merchant: string | null
  receiptNumber: string | null
  total: number | null
  currencyCode: string | null
  purchaseDate: Date | null
  status: string
  reviewedAt: Date | null
  blockedByCheck: boolean
  openCheckCodes: string[]
  /** Whether this receipt has been absorbed into an expense claim (#195's row-action relocation),
   * and if so, that claim's status — same shape ExpenseClaim.status uses. Null claimId means
   * "unclaimed"; nothing here changes ExpenseClaimItem's uniqueness (one claim per document). */
  claimId: string | null
  claimStatus: "draft" | "submitted" | "approved" | "rejected" | null
  /** Per-field extraction confidence (0-1), same shape/source as BillRow.fieldConfidence. */
  fieldConfidence: Record<string, number>
  /** #200: same touchless signal as BillRow.touchless — a `push.touchless_enqueued` document-audit
   * event exists for this receipt. */
  touchless: boolean
}

/** Loads receipts for a workspace. Bounded (up to `limit`, default 500), same reasoning as
 * listWorkspaceBills: a cockpit view is not the place to render a workspace's entire history. */
export async function listWorkspaceReceipts(input: {
  workspaceId: string
  limit?: number
  /** Status filter-chip group, same taxonomy as Invoices' Status chips: "unreviewed"/"reviewed"
   * map onto doc.status directly. */
  statusFilter?: "unreviewed" | "reviewed"
  /** Claim filter-chip group: whether the receipt has been absorbed into an expense claim yet. */
  claimFilter?: "unclaimed" | "claimed"
}): Promise<{ receipts: ReceiptRow[] }> {
  const limit = input.limit ?? 500

  const documents = await prisma.document.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: { notIn: ["received", "queued", "processing", "failed"] },
      template: { code: { in: ["receipt", "expense_receipt"] } },
    },
    select: {
      id: true, filename: true, status: true, reviewedAt: true, reviewedData: true, confidence: true,
      template: { select: { code: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: limit,
  })
  if (!documents.length) return { receipts: [] }

  const documentIds = documents.map((d) => d.id)
  const [openCheckTasks, claimItems, touchlessEvents] = await Promise.all([
    prisma.reviewTask.findMany({
      where: { workspaceId: input.workspaceId, documentId: { in: documentIds }, reason: "check_failed", status: { in: ["open", "in_review"] } },
      select: { documentId: true, detail: true },
    }),
    prisma.expenseClaimItem.findMany({
      where: { workspaceId: input.workspaceId, documentId: { in: documentIds } },
      select: { documentId: true, claim: { select: { id: true, status: true } } },
    }),
    prisma.documentAuditEvent.findMany({
      where: { workspaceId: input.workspaceId, documentId: { in: documentIds }, type: "push.touchless_enqueued" },
      select: { documentId: true },
    }),
  ])
  const touchlessDocIds = new Set(touchlessEvents.map((e) => e.documentId))

  const openChecksByDoc = new Map<string, string[]>()
  for (const task of openCheckTasks) {
    const code = task.detail ? task.detail.split(":")[0].trim() : "unknown"
    const list = openChecksByDoc.get(task.documentId) ?? []
    list.push(code)
    openChecksByDoc.set(task.documentId, list)
  }
  const claimByDoc = new Map(claimItems.map((item) => [item.documentId, item.claim]))

  const receipts: ReceiptRow[] = documents.map((doc) => {
    const values = (doc.reviewedData ?? {}) as Record<string, unknown>
    const openChecks = openChecksByDoc.get(doc.id) ?? []
    const claim = claimByDoc.get(doc.id) ?? null
    return {
      documentId: doc.id,
      filename: doc.filename,
      merchant: asString(values["merchant"]),
      receiptNumber: asString(values["receipt_number"]),
      total: asNumber(values["total"]),
      currencyCode: asString(values["currency_code"]),
      purchaseDate: asDate(values["purchase_date"]),
      status: doc.status,
      reviewedAt: doc.reviewedAt,
      blockedByCheck: openChecks.length > 0,
      openCheckCodes: openChecks,
      claimId: claim?.id ?? null,
      claimStatus: (claim?.status as ReceiptRow["claimStatus"]) ?? null,
      fieldConfidence: (doc.confidence as Record<string, unknown> | null)?.fieldConfidence as Record<string, number> ?? {},
      touchless: touchlessDocIds.has(doc.id),
    }
  })

  const filtered = receipts.filter((receipt) => {
    if (input.statusFilter === "unreviewed" && receipt.status === "reviewed") return false
    if (input.statusFilter === "reviewed" && receipt.status !== "reviewed") return false
    if (input.claimFilter === "unclaimed" && receipt.claimId !== null) return false
    if (input.claimFilter === "claimed" && receipt.claimId === null) return false
    return true
  })

  return { receipts: filtered }
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""))
    return Number.isFinite(n) ? n : null
  }
  return null
}
function asDate(v: unknown): Date | null {
  if (typeof v !== "string") return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

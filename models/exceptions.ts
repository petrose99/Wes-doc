// Deliberately NOT a "use server" module: server actions live upstream and do the auth. This
// trusts the workspaceId it is handed. Mirrors models/bills.ts's shape.
import { prisma } from "@/lib/db"
import { DOC_TYPE_SPECS, isDocType } from "@/lib/doc-types"

export type ExceptionResolution = "corrected" | "vendor_accepted" | "false_positive"
export type ExceptionStatus = "open" | "in_review" | "resolved"

/** #210 (Wayfinder map 177): one row per escalated `DocumentCheckResult` (`status: "escalated"`),
 * not per document — a document with three escalated checks shows three rows here. Vendor/amount/
 * doc-type are carried along so the row still reads as "about this document," per the ticket's
 * own note, even though its subject is the check. */
export type ExceptionRow = {
  id: string
  documentId: string
  filename: string
  docType: string | null
  docTypeLabel: string
  checkCode: string
  message: string
  vendor: string | null
  amount: number | null
  currencyCode: string | null
  escalationStatus: ExceptionStatus
  assigneeId: string | null
  assigneeName: string | null
  escalatedAt: Date
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}
function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function docTypeLabel(docType: string | null): string {
  if (docType && isDocType(docType)) return DOC_TYPE_SPECS[docType].label
  return "Document"
}

/** The Exceptions queue's read: every still-open (open or in_review) escalation in this
 * workspace, newest-escalated first. `escalationStatus` is null for rows escalated before this
 * ticket's migration backfilled nothing — treated as "open" so no pre-existing escalation is
 * silently dropped from the queue. */
export async function listOpenExceptions(workspaceId: string): Promise<ExceptionRow[]> {
  const rows = await prisma.documentCheckResult.findMany({
    where: { workspaceId, status: "escalated", OR: [{ escalationStatus: null }, { escalationStatus: { in: ["open", "in_review"] } }] },
    select: {
      id: true, documentId: true, checkCode: true, message: true, escalationStatus: true, updatedAt: true,
      escalationAssignee: { select: { id: true, name: true, email: true } },
      document: { select: { filename: true, docType: true, reviewedData: true } },
    },
    orderBy: { updatedAt: "desc" },
  })
  return rows.map((row) => {
    const values = (row.document.reviewedData ?? {}) as Record<string, unknown>
    return {
      id: row.id,
      documentId: row.documentId,
      filename: row.document.filename,
      docType: row.document.docType,
      docTypeLabel: docTypeLabel(row.document.docType),
      checkCode: row.checkCode,
      message: row.message,
      vendor: asString(values["vendor"]) ?? asString(values["merchant"]) ?? asString(values["supplier"]),
      amount: asNumber(values["total"]) ?? asNumber(values["amount"]) ?? asNumber(values["closing_balance"]),
      currencyCode: asString(values["currency_code"]),
      escalationStatus: (row.escalationStatus as ExceptionStatus | null) ?? "open",
      assigneeId: row.escalationAssignee?.id ?? null,
      assigneeName: row.escalationAssignee?.name || row.escalationAssignee?.email || null,
      escalatedAt: row.updatedAt,
    }
  })
}

/** The rail badge count — open + in_review, same set listOpenExceptions renders. */
export async function countOpenExceptions(workspaceId: string): Promise<number> {
  return prisma.documentCheckResult.count({
    where: { workspaceId, status: "escalated", OR: [{ escalationStatus: null }, { escalationStatus: { in: ["open", "in_review"] } }] },
  })
}

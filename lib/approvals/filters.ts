import type { ApprovalInvoiceRow, PoMismatchRow } from "@/models/approvals"

/** #257 spec 3.4: the Approvals facets as one pure predicate, shared by the server page (segment
 * counts), the client `QueueScreen` (the list it renders, the Filter sheet's "Show n rows") and
 * the empty state ("N waiting on other approvers") — one place decides what `?approver=` and
 * `?status=` mean. Type-only import: no prisma reaches the client bundle. */
type ApprovalFilterable = Pick<ApprovalInvoiceRow, "canDecide" | "eligibility">

export function scopedToMe(params: URLSearchParams): boolean {
  return params.get("approver") !== "anyone"
}

export function onlyNotEligible(params: URLSearchParams): boolean {
  return params.get("status") === "not_eligible"
}

export function filterApprovalRows<T extends ApprovalFilterable>(rows: T[], params: URLSearchParams): T[] {
  const me = scopedToMe(params)
  const notEligible = onlyNotEligible(params)
  return rows
    .filter((row) => !me || row.canDecide)
    .filter((row) => !notEligible || row.eligibility.status !== "ready")
}

export const filterApprovalInvoiceRows = (rows: ApprovalInvoiceRow[], params: URLSearchParams) => filterApprovalRows(rows, params)
export const filterPoMismatchRows = (rows: PoMismatchRow[], params: URLSearchParams) => filterApprovalRows(rows, params)

/** Rows the signed-in approver cannot decide — the count behind "N waiting on other approvers". */
export function countWaitingOnOthers(rows: ApprovalFilterable[]): number {
  return rows.filter((row) => !row.canDecide).length
}

/** A page's `searchParams` object as the `URLSearchParams` the predicate reads. */
export function searchParamsOf(record: Record<string, string | undefined>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(record)) if (value !== undefined) params.set(key, value)
  return params
}

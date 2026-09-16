/** #229 Q2 (#251): the Payment batch lifecycle — Pending approval → Approved → Paid, or Rejected
 * (terminal, returns its invoices to Bill Pay). `draft` and `sent` are the WP-AP2 run's legacy
 * words: a `draft` run was prepared by an owner (so it reads as Approved) and a `sent` one was
 * uploaded to the bank (Approved with the export fact). No persisted Draft exists any more —
 * the Create batch dialog is the draft. */

export type BatchStatus = "pending_approval" | "approved" | "paid" | "rejected" | "draft" | "sent"

/** Statuses under which the batch still holds its invoices (they read as Scheduled on Bill Pay). */
export const LIVE_BATCH_STATUSES: readonly BatchStatus[] = ["pending_approval", "approved", "draft", "sent"]

export type BatchView = "pending_approval" | "approved" | "paid" | "rejected"

export function batchView(status: string): BatchView {
  if (status === "pending_approval") return "pending_approval"
  if (status === "paid") return "paid"
  if (status === "rejected") return "rejected"
  return "approved"
}

export const BATCH_VIEW_LABEL: Record<BatchView, string> = {
  pending_approval: "Pending approval",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
}

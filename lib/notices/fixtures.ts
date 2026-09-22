import type { ApprovalNoticeRow } from "@/components/emails/approval-notice-email"

/** Dev-only fixtures for /dev/emails/approval-notice — one entry per copy-matrix case in
 * spec.md §3, so every case can be captured at 600/390 without a live workspace. */
export const APPROVAL_NOTICE_FIXTURES: Record<string, { heading: string; rows: ApprovalNoticeRow[]; workspaceName: string; footerVariant: "approver" | "starter"; reason?: string }> = {
  single: {
    heading: "Acme Supplies needs your approval",
    workspaceName: "Northwind Trading",
    footerVariant: "approver",
    rows: [{ kind: "reached", supplier: "Acme Supplies", invoiceNumber: "INV-2044", amount: 1280.5, currency: "USD", url: "https://app.docubite.com/workspaces/w1/approvals/invoices?doc=d1&via=notice", waitingDays: 0 }],
  },
  plural: {
    heading: "3 invoices need your approval",
    workspaceName: "Northwind Trading",
    footerVariant: "approver",
    rows: [
      { kind: "reached", supplier: "Acme Supplies", invoiceNumber: "INV-2044", amount: 1280.5, currency: "USD", url: "#", waitingDays: 0 },
      { kind: "reached", supplier: "Blue Ridge Freight", invoiceNumber: "INV-991", amount: 430, currency: "USD", url: "#", waitingDays: 0 },
      { kind: "reached", supplier: "Cedar & Co", invoiceNumber: "INV-118", amount: 9800, currency: "USD", url: "#", waitingDays: 0 },
    ],
  },
  nudge: {
    heading: "Still waiting on you: Acme Supplies",
    workspaceName: "Northwind Trading",
    footerVariant: "approver",
    rows: [{ kind: "nudge", supplier: "Acme Supplies", invoiceNumber: "INV-2044", amount: 1280.5, currency: "USD", url: "#", waitingDays: 3 }],
  },
  mixed: {
    heading: "2 invoices need your approval",
    workspaceName: "Northwind Trading",
    footerVariant: "approver",
    rows: [
      { kind: "reached", supplier: "Acme Supplies", invoiceNumber: "INV-2044", amount: 1280.5, currency: "USD", url: "#", waitingDays: 0 },
      { kind: "nudge", supplier: "Blue Ridge Freight", invoiceNumber: "INV-991", amount: 430, currency: "USD", url: "#", waitingDays: 4 },
    ],
  },
  "sent-back": {
    heading: "Priya Shah sent Acme Supplies back for review",
    workspaceName: "Northwind Trading",
    footerVariant: "starter",
    reason: "Missing PO reference — please attach the purchase order.",
    rows: [{ kind: "sent_back", supplier: "Acme Supplies", invoiceNumber: "INV-2044", amount: 1280.5, currency: "USD", url: "#", waitingDays: 0 }],
  },
  "long-names": {
    heading: "Extraordinarily Long International Logistics & Freight Forwarding Consortium Ltd needs your approval",
    workspaceName: "Northwind Trading International Holdings",
    footerVariant: "approver",
    rows: [{ kind: "reached", supplier: "Extraordinarily Long International Logistics & Freight Forwarding Consortium Ltd", invoiceNumber: "INV-2044-VERY-LONG-REFERENCE-NUMBER", amount: 1280500.75, currency: "USD", url: "#", waitingDays: 0 }],
  },
}

export type ApprovalNoticeFixtureCase = keyof typeof APPROVAL_NOTICE_FIXTURES

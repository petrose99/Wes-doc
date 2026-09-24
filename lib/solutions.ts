import { Building2, ClipboardCheck, Landmark, Users, type LucideIcon } from "lucide-react"

/** The Solutions mega-menu and the /solutions/[slug] pages read from this one list, so a new
 * solution is a single entry here rather than a page plus a nav edit that can drift apart.
 *
 * `group` drives the menu columns:
 *  - "ap"      — WHO the AP loop is for (bookkeeper, controller, finance-ops team). The primary
 *                surface after the WP-AP2 reposition: DocuBite is AI accounts payable first.
 */
export type SolutionGroup = "ap"

export type Solution = {
  slug: string
  group: SolutionGroup
  /** Menu label and role heading. */
  name: string
  /** The one-liner under the label in the mega-menu. */
  tagline: string
  icon: LucideIcon
  title: string
  description: string
  /** Chips under the hero: workflow signals relevant to this role. */
  fields: string[]
  points: { title: string; text: string }[]
}

export const SOLUTION_GROUPS: { id: SolutionGroup; label: string }[] = [
  { id: "ap", label: "For AP teams" },
]

export const SOLUTIONS: Solution[] = [
  {
    slug: "ap-controllers",
    group: "ap",
    name: "In-house AP controllers",
    tagline: "Checks, matching, approvals — before a bill hits the ledger",
    icon: ClipboardCheck,
    title: "AP automation a controller can defend to an auditor",
    description: "Run supplier invoices through fraud checks (bank-detail freeze, split-invoice detection, suspicious resubmission), 2- and 3-way match them to the PO, route them through amount-thresholded approval stages, and push to your ledger — with a full audit trail on every step.",
    fields: ["Vendor onboarding red flags", "Bank-detail change freeze", "3-way match discrepancies", "Amount-thresholded approvals", "QuickBooks / Xero / built-in ledger", "Document-level audit trail"],
    points: [
      { title: "Fraud checks that Dext-class tools don't run", text: "A supplier's IBAN silently changing to a new account is one of the most common invoice-fraud vectors. DocuBite freezes the bill, opens a review task, and only clears once a person has looked. Split-invoice and suspicious-resubmission detection sit next to it." },
      { title: "3-way matching wired end-to-end", text: "POs, invoices and receipts match on vendor + amount + date + PO number with configurable tolerances. Discrepancies surface with the exact deltas so a controller sees what to negotiate, not just that something is off." },
      { title: "Approvals with named approvers and amount thresholds", text: "Each approval stage can require a specific named approver and only apply above a spend threshold — the workflow a real controller runs, not a single approve/reject switch." },
    ],
  },
  {
    slug: "bookkeepers-running-client-ap",
    group: "ap",
    name: "Bookkeepers running client AP",
    tagline: "One workspace per client, everything they email you handled",
    icon: Users,
    title: "The workspace-per-client AP your bookkeeping practice already runs on",
    description: "Each client gets their own workspace with its own inbound email address, its own supplier registry, its own approval workflows, and its own ledger connection. Suppliers email invoices straight in — you review, approve, and push, without lifting them out of Outlook first.",
    fields: ["Per-client workspace + inbound email", "Per-client supplier registry + payment terms", "Per-client approval workflows", "Per-client ledger connection (QuickBooks / Xero)", "Programmatic API for practice integrations"],
    points: [
      { title: "Client-scoped inbound email", text: "<token>@inbound.docubite.app per workspace, allowlisted to the client's real senders. Nothing else gets in. Your practice inbox stops being an unfiled AP queue." },
      { title: "The AP loop, per client", text: "Same coding, checks, matching, approvals and sync — configured per client so a small trader gets a plain workflow and a growing SME gets thresholded approvals. Change one client's rules without touching anyone else's." },
      { title: "API for practice management", text: "POST /api/v1/documents ingests a bill from your practice-management system straight into the client's queue; webhook events (bill.pushed, match.discrepancy, check.failed) fire when work moves." },
    ],
  },
  {
    slug: "finance-ops-teams",
    group: "ap",
    name: "Finance-ops teams",
    tagline: "The whole AP loop, in one tool your CFO can see into",
    icon: Building2,
    title: "AP the whole finance team can watch, not just do",
    description: "Aging cockpit that shows every bill, every aging bucket, every blocked-by-check bill in one screen. Bank-ready payment files a controller can prepare and hand to treasury without a spreadsheet in between. Everything auditable, everything measurable.",
    fields: ["AP aging cockpit (current / 1-30 / 31-60 / 61-90 / 90+)", "Blocked-by-check filter for stuck bills", "ZA EFT / bulk-payment CSV export", "Bank-match reconciliation once paid", "Health dashboard for AP performance"],
    points: [
      { title: "One aging view for every bill", text: "Not per-account, not per-supplier — every AP bill in the workspace, bucketed by days past due, with payment status from the ledger sync and a blocked-by-check flag on any bill that failed one of DocuBite's checks. What a CFO looks at on a Monday." },
      { title: "Pay-ready, not pay-executing", text: "Select bills and generate a ZA EFT CSV your bank's bulk-payment portal accepts (Standard Bank, Absa, Nedbank, FNB). Payment execution stays on your bank's rails — we keep DocuBite outside every payment license." },
      { title: "Bank match closes the loop", text: "Once your bank pushes settled transactions back through the ledger sync, the existing bank-match pipeline ties them to the paid bills so the aging cockpit updates itself." },
    ],
  },
]

export type Industry = {
  icon: LucideIcon
  name: string
  tagline: string
  tags: string[]
  before: string[]
  after: string[]
}

/** The industries teased on the homepage and detailed on /solutions#industries. Shared here (like
 * SOLUTIONS) so the two pages can never drift on which industries exist or what they're called.
 * DocuBite is finance-only, so this is a single entry. */
export const INDUSTRIES: Industry[] = [
  {
    icon: Landmark,
    name: "Finance & bookkeeping",
    tagline: "Month-end shouldn't mean a keyboard and a shoebox of receipts.",
    tags: ["Supplier invoices", "Expense receipts", "Bank statements", "Remittance advice"],
    before: [
      "Open each PDF and retype supplier, date, net, VAT, total",
      "Squint at photographed receipts and faded thermal paper",
      "Hunt for the source PDF when a figure looks wrong",
    ],
    after: [
      "Drop the whole folder — invoices, receipts, statements — and get back the duplicates first",
      "Fields land as rows; low-confidence ones flag themselves",
      "Total per supplier with the assistant, click any figure to its line",
    ],
  },
]

export const getSolution = (slug: string) => SOLUTIONS.find((solution) => solution.slug === slug)

export const solutionsByGroup = (group: SolutionGroup) => SOLUTIONS.filter((solution) => solution.group === group)

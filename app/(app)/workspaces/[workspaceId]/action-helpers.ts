// Deliberately NOT a "use server" module. A "use server" file may only export async functions,
// so `paths`, `NO_ACCESS` and friends cannot live in one — and both actions.ts and
// workspace-actions.ts need them. Extracting them here is the only way to share them.
import { requireWorkspaceRole } from "@/models/workspaces"
import { revalidatePath } from "next/cache"
import { LINE_CODING_FALLBACK_TEXT } from "@/lib/checks/line-coding"

/** `documents` is only the detail-page prefix — there is no document list page; the sheet is
 * the view of that data, so document mutations revalidate the file's `sheet`. */
// `approvals` used to name the Approval-workflows settings page before #236 gave the Approvals
// destination itself a URL — kept as `approvalWorkflowSettings` (now Admin › Approval Flows, #252)
// and the two queue routes added beside it, so neither call site silently points elsewhere.
export const paths = (workspaceId: string) => ({ overview: `/workspaces/${workspaceId}`, documents: `/workspaces/${workspaceId}/documents`, pipeline: `/workspaces/${workspaceId}/pipeline`, files: `/workspaces/${workspaceId}/worksheets`, dictation: `/workspaces/${workspaceId}/dictation`, templates: `/workspaces/${workspaceId}/admin/configuration/whats-on`, reports: `/workspaces/${workspaceId}/admin/configuration/whats-on`, workspace: `/workspaces/${workspaceId}/admin/users`, integrations: `/workspaces/${workspaceId}/admin/integrations`, tax: `/workspaces/${workspaceId}/admin/configuration/tax`, review: `/workspaces/${workspaceId}/review`, rules: `/workspaces/${workspaceId}/admin/suppliers`, modules: `/workspaces/${workspaceId}/admin/configuration/whats-on`, settingsEmail: `/workspaces/${workspaceId}/admin/configuration/intake`, approvalWorkflowSettings: `/workspaces/${workspaceId}/admin/approval-flows`, receipts: `/workspaces/${workspaceId}/receipts`, expenses: `/workspaces/${workspaceId}/expenses`, accounting: `/workspaces/${workspaceId}/accounting`, exceptions: `/workspaces/${workspaceId}/exceptions`, approvalsInvoices: `/workspaces/${workspaceId}/approvals/invoices`, approvalsPoMismatches: `/workspaces/${workspaceId}/approvals/po-mismatches` })

/** Revalidates the whole workspace segment layout, not just one page — needed whenever a change
 * (module toggle, rename, ownership transfer) should update the persistent sidebar, which the
 * layout renders once and a plain revalidatePath(concretePath) does not reach. */
export const revalidateWorkspaceLayout = () => revalidatePath("/workspaces/[workspaceId]", "layout")

export const sheetPath = (workspaceId: string, fileId: string) => `/workspaces/${workspaceId}/worksheets/${fileId}/sheet`

/** Refusals, spelled out. The generic underscore-to-space fallback turns
 * "member_not_found" into "member not found", which is fine for most codes but not all of them.
 * Codes not listed here still fall through to that behaviour. */
const BILLING_MESSAGES: Record<string, string> = {
  free_trial_storage_exceeded: "You've reached the 200 MB free-trial upload limit for this company.",
  fx_rate_pending: "This document is in a different currency and its exchange rate hasn't been fetched yet. Try again in a moment.",
  // Integrations (P1). The url_* codes come from lib/url-safety's SSRF guard.
  integrations_not_available: "Integrations aren't enabled on this deployment.",
  url_scheme_not_https: "The webhook URL must start with https://.",
  url_private_ip: "That URL points at a private or internal address, which isn't allowed.",
  url_invalid: "That doesn't look like a valid URL.",
  url_has_credentials: "Remove the username and password from the URL.",
  url_dns_failed: "That host couldn't be resolved. Check the URL and try again.",
  invalid_event_type: "One of the selected events isn't recognised.",
  api_key_not_found: "That API key no longer exists.",
  webhook_endpoint_not_found: "That webhook endpoint no longer exists.",
  delivery_not_found: "That delivery no longer exists.",
  // Accounting connectors (P2).
  integration_connection_not_found: "That connection no longer exists.",
  bill_missing_total: "This document has no total to push.",
  ledger_duplicate: "A bill with this reference number already exists in your accounting ledger.",
  bank_match_not_found: "That match no longer exists.",
  inbound_email_disabled_for_clinical: "Inbound email intake isn't available for a healthcare company.",
  pattern_invalid: "Enter a full email address (name@domain.com) or a domain (@domain.com).",
  allowed_sender_not_found: "That sender no longer exists.",
  // #374: WhatsApp allowed-sender validation (models/inbound-whatsapp.ts addAllowedSender).
  phone_number_invalid: "Enter a full phone number with country code, like +266 6123 4567.",
  label_required: "Enter a name for this sender.",
  // Dext-parity Phase 3 WP3.1/WP3.2: approval workflows.
  approval_workflow_not_found: "That approval workflow no longer exists.",
  workflow_needs_at_least_one_stage: "Add at least one stage.",
  review_task_has_no_workflow: "This review task has no workflow attached.",
  workflow_stage_not_found: "That workflow stage no longer exists.",
  stage_requires_owner: "Only an owner can decide this stage.",
  review_task_already_has_workflow: "This review task already has a workflow attached.",
  review_task_not_open: "This review task has already moved past open — a workflow can only be started while it's open.",
  // #236: Approvals — Send back for review / Cancel.
  review_task_not_in_review: "This Approval isn't currently awaiting a decision.",
  reason_required: "A reason is required.",
  approval_already_advanced: "A stage has already been decided on this Approval — send it back for review instead of cancelling it.",
  gate_not_found: "That check no longer exists.",
  payment_status_required: "Confirm whether this has been paid before approving it.",
  // Dext-parity Phase 3 WP3.3: expense claims.
  expense_claim_not_found: "That expense claim no longer exists.",
  expense_claim_needs_at_least_one_receipt: "Add at least one receipt to this claim.",
  document_not_an_expense_receipt: "Only expense receipt documents can be added to a claim.",
  document_already_claimed: "One of these receipts is already on another claim.",
  expense_claim_not_draft: "This claim has already been submitted and can no longer be edited.",
  no_receipts_given: "Select at least one receipt to add.",
  expense_claim_item_not_found: "That receipt isn't on this claim.",
  expense_claim_not_submitted: "This claim isn't awaiting a decision.",
  expense_claim_has_workflow: "This claim is on a workflow — decide its current stage instead.",
  expense_claim_has_no_workflow: "This claim has no workflow attached.",
  // #250: Match manually.
  po_match_not_found: "That purchase order link no longer exists. Reload the row and try again.",
  purchase_order_not_found: "That purchase order no longer exists.",
  // #457 / ADR 0013: Company currency.
  company_country_unsupported: "DocuBite works with companies in Lesotho and South Africa.",
  company_currency_not_allowed: "A company in South Africa uses ZAR.",
  company_currency_locked: "Couldn't change it: the company currency is locked because something was already posted in it.",
  company_currency_push_in_flight: "A bill is being posted right now. Try again in a minute.",
  // Push error codes (lib/integration-push.ts gateLedgerCurrency); the review task carries the
  // provider and both currencies by name.
  ledger_currency_differs: "Your ledger keeps its books in a different currency from this company.",
  ledger_currency_unreadable: "Couldn't read your ledger's currency yet. It's checked again before each bill is posted.",
  // lib/integrations/ledger-capabilities.ts: the ledger didn't say whether VAT is on, so nothing is
  // posted until it does.
  ledger_capabilities_unreadable: "Couldn't read your ledger's VAT and tracking settings yet. Nothing is posted until they can be read; it tries again shortly.",
  // Line coding Checks (lib/checks/line-coding.ts) as push errors; the review task itself names
  // the ledger, the category and the option — this fallback only has the code, so its wording is
  // LINE_CODING_FALLBACK_TEXT, not a re-typed copy (a past copy-paste let the two drift).
  ...LINE_CODING_FALLBACK_TEXT,
  quickbooks_feature_not_supported: "QuickBooks turned down a field this plan doesn't offer. Sync accounts, then check the bill.",
}

export const errorMessage = (error: unknown, fallback: string) => {
  if (!(error instanceof Error)) return fallback
  return BILLING_MESSAGES[error.message] || error.message.replaceAll("_", " ")
}

export const NO_ACCESS = "You no longer have access to this company"

/** requireWorkspaceRole throws on a missing membership or insufficient role. Actions call this
 * instead so the client gets an ActionState error to show, rather than a rejected promise. */
export async function requireMember(workspaceId: string, userId: string, roles?: Parameters<typeof requireWorkspaceRole>[2]) {
  try {
    return await requireWorkspaceRole(workspaceId, userId, roles)
  } catch {
    return null
  }
}

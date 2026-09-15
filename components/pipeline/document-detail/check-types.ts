import type { CheckStatus } from "@/lib/checks/types"

export type FieldCheck = {
  id: string
  checkCode: string
  status: CheckStatus
  message: string
  fields: string[]
  detail?: Record<string, unknown>
  /** Server-derived checks stay visible after an edit, but are explicitly stale until save. */
  stale?: boolean
  /** A reviewer marked this "the document is wrong" rather than fixing the cell — feeds #210's
   * Exceptions queue. Orthogonal to `status`: the computed verdict (pass/warn/fail) still
   * describes the check itself, this just records that a human routed it elsewhere. */
  escalated?: boolean
}

export function checkAppliesToField(check: FieldCheck, fieldPath: string): boolean {
  return check.fields.some((field) => field === fieldPath)
}

export function checkLabel(checkCode: string): string {
  const labels: Record<string, string> = {
    invoice_arithmetic: "Arithmetic",
    line_item_arithmetic: "Line arithmetic",
    statement_balance: "Balance",
    tax_consistency: "Tax",
    amount_anomaly: "Amount anomaly",
    bank_detail_change: "Bank details",
    duplicate: "Duplicate",
    suspicious_resubmission: "Resubmission",
    missing_statement_period: "Statement gap",
    split_invoice: "Split invoice",
    vat_number_format: "VAT format",
    vendor_onboarding: "Supplier review",
    statement_layout_drift: "Statement layout",
  }
  return labels[checkCode] ?? "Check"
}

export function fieldsFromCheckDetail(detail: unknown): string[] {
  if (!detail || typeof detail !== "object" || !Array.isArray((detail as { fields?: unknown }).fields)) return []
  return (detail as { fields: unknown[] }).fields.filter((field): field is string => typeof field === "string")
}

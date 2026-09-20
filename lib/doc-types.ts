/**
 * Single source of truth for document types, replacing the per-template-code
 * maps scattered across ~25 modules (SUPPLIER_FIELD_BY_TEMPLATE, CHECK_FIELD_MAPS,
 * AMOUNT_KEYS, CANDIDATE_FIELD_MAPS, TEMPLATE_ROLES, EXPENSE_TEMPLATE_CODES,
 * pushableTemplateCodes). Stage 4 re-keys every consumer to this registry;
 * until then, the bridge functions let old and new code coexist.
 */

export const DOC_TYPES = [
  "invoice",
  "receipt",
  "bank_statement",
  "purchase_order",
  "delivery_note",
  "contract",
  "payslip",
  "tax_form",
  "other",
] as const

export type DocType = (typeof DOC_TYPES)[number]

export type DocCategory = "expense" | "sale" | "other"

export type CanonicalKey = { key: string; hint: string }

export type CheckFieldMap = {
  supplier?: string; invoiceNumber?: string; date?: string
  subtotal?: string; taxTotal?: string; shippingTotal?: string; otherCharges?: string
  total?: string; currency?: string; lineItems?: string
  accountNumber?: string; openingBalance?: string; closingBalance?: string
  periodStart?: string; periodEnd?: string; transactions?: string; accounts?: string
  supplierVatNumber?: string; paymentIban?: string
}

export type AmountKeyMap = {
  subtotal?: string; taxTotal?: string; shippingTotal?: string; otherCharges?: string
  total?: string; lineItems?: string; currency?: string
  openingBalance?: string; closingBalance?: string; transactions?: string; accounts?: string
}

export type MatchCandidateFieldMap = {
  supplier: string; total: string; date: string; currency: string; invoiceNumber?: string
}

export type DocTypeSpec = {
  label: string
  defaultCategory: DocCategory
  counterpartyField?: string
  taxField?: string
  amountKeys?: AmountKeyMap
  checkFields?: CheckFieldMap
  matchCandidateFields?: MatchCandidateFieldMap
  matchRole?: "po" | "invoice" | "receipt" | null
  canonicalKeys: CanonicalKey[]
  retrievalHints?: string[]
}

export const DOC_TYPE_SPECS: Record<DocType, DocTypeSpec> = {
  invoice: {
    label: "Invoice",
    defaultCategory: "expense",
    counterpartyField: "vendor",
    taxField: "tax_total",
    amountKeys: {
      subtotal: "subtotal", taxTotal: "tax_total", shippingTotal: "shipping_total",
      otherCharges: "other_charges", total: "total", lineItems: "line_items",
      currency: "currency_code",
    },
    checkFields: {
      supplier: "vendor", invoiceNumber: "invoice_number", date: "issue_date",
      subtotal: "subtotal", taxTotal: "tax_total", shippingTotal: "shipping_total",
      otherCharges: "other_charges", total: "total", currency: "currency_code",
      lineItems: "line_items", supplierVatNumber: "supplier_vat_number",
      paymentIban: "payment_iban",
    },
    matchCandidateFields: {
      supplier: "vendor", total: "total", date: "issue_date",
      currency: "currency_code", invoiceNumber: "invoice_number",
    },
    matchRole: "invoice",
    canonicalKeys: [
      { key: "vendor", hint: "Name of the vendor or supplier" },
      { key: "invoice_number", hint: "Invoice reference number" },
      { key: "issue_date", hint: "Date the invoice was issued (YYYY-MM-DD)" },
      { key: "due_date", hint: "Payment due date (YYYY-MM-DD)" },
      { key: "subtotal", hint: "Amount before tax" },
      { key: "tax_total", hint: "Total tax amount" },
      { key: "shipping_total", hint: "Shipping/freight charges" },
      { key: "other_charges", hint: "Any other charges (array of {description, amount})" },
      { key: "total", hint: "Total amount due" },
      { key: "currency_code", hint: "ISO 4217 currency code (e.g. USD, EUR)" },
      { key: "line_items", hint: "Array of {description, quantity, unit_price, amount}" },
      { key: "payment_terms", hint: "Payment terms (e.g. Net 30)" },
      { key: "supplier_vat_number", hint: "Supplier VAT / tax ID" },
      { key: "payment_iban", hint: "IBAN for payment" },
      { key: "po_number", hint: "Purchase order reference, if any" },
    ],
  },

  receipt: {
    label: "Receipt",
    defaultCategory: "expense",
    counterpartyField: "merchant",
    taxField: "tax_total",
    amountKeys: {
      subtotal: "subtotal", taxTotal: "tax_total", total: "total", lineItems: "line_items",
      currency: "currency_code",
    },
    checkFields: {
      supplier: "merchant", invoiceNumber: "receipt_number", date: "purchase_date",
      subtotal: "subtotal", taxTotal: "tax_total", total: "total", currency: "currency_code",
      lineItems: "line_items",
    },
    matchCandidateFields: {
      supplier: "merchant", total: "total", date: "purchase_date",
      currency: "currency_code", invoiceNumber: "receipt_number",
    },
    matchRole: "receipt",
    canonicalKeys: [
      { key: "merchant", hint: "Name of the merchant or store" },
      { key: "receipt_number", hint: "Receipt reference number" },
      { key: "purchase_date", hint: "Date of purchase (YYYY-MM-DD)" },
      { key: "subtotal", hint: "Amount before tax, if shown separately" },
      { key: "total", hint: "Total amount paid" },
      { key: "tax_total", hint: "Total tax amount" },
      { key: "currency_code", hint: "ISO 4217 currency code" },
      { key: "payment_method", hint: "Payment method (e.g. cash, card)" },
      { key: "line_items", hint: "Array of {description, quantity, unit_price, amount}" },
    ],
  },

  bank_statement: {
    label: "Bank statement",
    defaultCategory: "other",
    amountKeys: {
      openingBalance: "opening_balance", closingBalance: "closing_balance",
      transactions: "transactions", accounts: "accounts", currency: "currency_code",
    },
    checkFields: {
      accountNumber: "account_number", openingBalance: "opening_balance",
      closingBalance: "closing_balance", periodStart: "statement_period_start",
      periodEnd: "statement_period_end", transactions: "transactions",
      accounts: "accounts", currency: "currency_code",
    },
    canonicalKeys: [
      { key: "bank_name", hint: "Name of the financial institution" },
      { key: "account_number", hint: "Account number (masked if partial)" },
      { key: "statement_period_start", hint: "Period start date (YYYY-MM-DD)" },
      { key: "statement_period_end", hint: "Period end date (YYYY-MM-DD)" },
      { key: "opening_balance", hint: "Opening balance for the period" },
      { key: "closing_balance", hint: "Closing balance for the period" },
      { key: "currency_code", hint: "ISO 4217 currency code" },
      { key: "transactions", hint: "Array of {date, description, amount, balance}" },
      { key: "accounts", hint: "Array of {account_number, type, opening_balance, closing_balance}" },
    ],
  },

  purchase_order: {
    label: "Purchase order",
    defaultCategory: "expense",
    counterpartyField: "supplier",
    amountKeys: {
      total: "total", lineItems: "line_items", currency: "currency_code",
    },
    checkFields: {
      supplier: "supplier", invoiceNumber: "po_number", date: "order_date",
      total: "total", currency: "currency_code", lineItems: "line_items",
    },
    matchRole: "po",
    canonicalKeys: [
      { key: "supplier", hint: "Name of the supplier" },
      { key: "po_number", hint: "Purchase order number" },
      { key: "order_date", hint: "Order date (YYYY-MM-DD)" },
      { key: "delivery_date", hint: "Expected delivery date (YYYY-MM-DD)" },
      { key: "total", hint: "Total order value" },
      { key: "currency_code", hint: "ISO 4217 currency code" },
      { key: "line_items", hint: "Array of {description, quantity, unit_price, amount}" },
      { key: "ship_to", hint: "Shipping address" },
    ],
  },

  delivery_note: {
    label: "Delivery note",
    defaultCategory: "other",
    counterpartyField: "supplier",
    canonicalKeys: [
      { key: "supplier", hint: "Name of the delivering party" },
      { key: "delivery_note_number", hint: "Delivery note reference" },
      { key: "delivery_date", hint: "Delivery date (YYYY-MM-DD)" },
      { key: "po_number", hint: "Related purchase order number" },
      { key: "line_items", hint: "Array of {description, quantity}" },
      { key: "receiver", hint: "Name of the receiving party" },
    ],
  },

  contract: {
    label: "Contract",
    defaultCategory: "other",
    canonicalKeys: [
      { key: "parties", hint: "Array of party names" },
      { key: "contract_date", hint: "Date of agreement (YYYY-MM-DD)" },
      { key: "effective_date", hint: "Date terms take effect (YYYY-MM-DD)" },
      { key: "expiry_date", hint: "Contract end date (YYYY-MM-DD)" },
      { key: "contract_value", hint: "Total contract value if stated" },
      { key: "currency_code", hint: "ISO 4217 currency code" },
      { key: "summary", hint: "Brief summary of the contract" },
    ],
  },

  payslip: {
    label: "Payslip",
    defaultCategory: "expense",
    counterpartyField: "employee_name",
    canonicalKeys: [
      { key: "employee_name", hint: "Name of the employee" },
      { key: "employer", hint: "Name of the employer" },
      { key: "pay_period_start", hint: "Pay period start (YYYY-MM-DD)" },
      { key: "pay_period_end", hint: "Pay period end (YYYY-MM-DD)" },
      { key: "gross_pay", hint: "Gross pay amount" },
      { key: "net_pay", hint: "Net pay amount" },
      { key: "deductions", hint: "Array of {description, amount}" },
      { key: "currency_code", hint: "ISO 4217 currency code" },
    ],
  },

  tax_form: {
    label: "Tax form",
    defaultCategory: "other",
    canonicalKeys: [
      { key: "form_type", hint: "Tax form identifier (e.g. W-2, 1099, VAT return)" },
      { key: "tax_period", hint: "Tax period covered" },
      { key: "filing_date", hint: "Date filed or issued (YYYY-MM-DD)" },
      { key: "taxpayer_name", hint: "Name of the taxpayer" },
      { key: "tax_id", hint: "Tax identification number" },
      { key: "total_tax", hint: "Total tax amount" },
      { key: "currency_code", hint: "ISO 4217 currency code" },
    ],
  },

  other: {
    label: "Other document",
    defaultCategory: "other",
    canonicalKeys: [
      { key: "title", hint: "Document title or heading" },
      { key: "date", hint: "Primary date on the document (YYYY-MM-DD)" },
      { key: "summary", hint: "Brief summary of the document" },
    ],
  },
}

// ---------------------------------------------------------------------------
// Legacy template-code bridge
// ---------------------------------------------------------------------------

const LEGACY_CODE_TO_DOC_TYPE: Record<string, DocType> = {
  invoice: "invoice",
  expense: "invoice",
  receipt: "receipt",
  expense_receipt: "receipt",
  purchase_order: "purchase_order",
  bank_statement: "bank_statement",
  remittance_advice: "other",
  supplier_statement: "other",
  general_report: "other",
  generic: "other",
}

const DOC_TYPE_TO_LEGACY_CODE: Record<DocType, string> = {
  invoice: "invoice",
  receipt: "receipt",
  bank_statement: "bank_statement",
  purchase_order: "purchase_order",
  delivery_note: "generic",
  contract: "generic",
  payslip: "generic",
  tax_form: "generic",
  other: "generic",
}

export function legacyTemplateCodeToDocType(code: string): DocType {
  return LEGACY_CODE_TO_DOC_TYPE[code] ?? "other"
}

export function docTypeToLegacyTemplateCode(docType: DocType): string {
  return DOC_TYPE_TO_LEGACY_CODE[docType]
}

/**
 * Resolve the canonical DocType for a document. Priority:
 * 1. Explicit `docType` column (set by the classification pass)
 * 2. Legacy template.code bridge (old docs that were never classified)
 * 3. "other" fallback
 */
export function resolveDocType(doc: { docType?: string | null; template?: { code: string } | null }): DocType {
  if (doc.docType && isDocType(doc.docType)) return doc.docType
  if (doc.template?.code) return legacyTemplateCodeToDocType(doc.template.code)
  return "other"
}

export function resolveDocTypeSpec(doc: { docType?: string | null; template?: { code: string } | null }): DocTypeSpec {
  return DOC_TYPE_SPECS[resolveDocType(doc)]
}

export function isDocType(value: string): value is DocType {
  return (DOC_TYPES as readonly string[]).includes(value)
}

export function counterpartyFieldForDoc(doc: { docType?: string | null; template?: { code: string } | null }): string | undefined {
  return resolveDocTypeSpec(doc).counterpartyField
}

export function checkFieldsForDoc(doc: { docType?: string | null; template?: { code: string } | null }): CheckFieldMap | undefined {
  return resolveDocTypeSpec(doc).checkFields
}

export function amountKeysForDoc(doc: { docType?: string | null; template?: { code: string } | null }): AmountKeyMap | undefined {
  return resolveDocTypeSpec(doc).amountKeys
}

export function matchCandidateFieldsForDoc(doc: { docType?: string | null; template?: { code: string } | null }): MatchCandidateFieldMap | undefined {
  return resolveDocTypeSpec(doc).matchCandidateFields
}

export function matchRoleForDoc(doc: { docType?: string | null; template?: { code: string } | null }): "po" | "invoice" | "receipt" | null {
  return resolveDocTypeSpec(doc).matchRole ?? null
}

export function isExpenseDocType(docType: DocType): boolean {
  return DOC_TYPE_SPECS[docType].defaultCategory === "expense"
}

export const EXPENSE_DOC_TYPES: DocType[] = DOC_TYPES.filter((t) => DOC_TYPE_SPECS[t].defaultCategory === "expense")

export const PUSHABLE_DOC_TYPES: DocType[] = ["invoice", "receipt", "bank_statement"]

export function isPushableDocument(doc: { docType?: string | null; template?: { code: string } | null }): boolean {
  return (PUSHABLE_DOC_TYPES as string[]).includes(resolveDocType(doc))
}

/** #270 §1: the four values Search's generic columns (Supplier, Number, Date, Amount) read off
 * `reviewedData ?? rawExtraction` for each doc type. Reuses `checkFields`'s keys where a type has
 * them; the five types with no `checkFields` (delivery_note onward) map onto their nearest
 * `canonicalKeys` equivalent instead of leaving the columns permanently blank. */
export type SearchFieldMap = { supplier?: string; number?: string; date?: string; amount?: string }
export const SEARCH_FIELD_KEYS: Record<DocType, SearchFieldMap> = {
  invoice: { supplier: "vendor", number: "invoice_number", date: "issue_date", amount: "total" },
  receipt: { supplier: "merchant", number: "receipt_number", date: "purchase_date", amount: "total" },
  bank_statement: { supplier: "bank_name", number: "account_number", date: "statement_period_start", amount: "closing_balance" },
  purchase_order: { supplier: "supplier", number: "po_number", date: "order_date", amount: "total" },
  delivery_note: { supplier: "supplier", number: "delivery_note_number", date: "delivery_date" },
  contract: { date: "contract_date", amount: "contract_value" },
  payslip: { supplier: "employer", date: "pay_period_start", amount: "net_pay" },
  tax_form: { supplier: "taxpayer_name", number: "tax_id", date: "filing_date", amount: "total_tax" },
  other: { date: "date" },
}

export const PAID_STATUSES = ["paid", "unpaid"] as const
export type PaidStatus = (typeof PAID_STATUSES)[number]

export function isPaidStatus(value: unknown): value is PaidStatus {
  return typeof value === "string" && (PAID_STATUSES as readonly string[]).includes(value)
}

/** Whether a document's review task requires a person to have confirmed paid/unpaid before it can
 * be approved. Reuses the expense/sale/other split rather than a new list: every doc type that is
 * itself a bill somebody owes money on (invoice, receipt, purchase_order, payslip) is "expense" for
 * exactly this reason, and a bank statement or contract has no payment state of its own to confirm.
 * See models/review-tasks.ts for where this actually gates approval. */
export function isPaymentConfirmationRequired(doc: { docType?: string | null; template?: { code: string } | null }): boolean {
  return isExpenseDocType(resolveDocType(doc))
}

export function isCategoryConfirmed(codingData: Record<string, unknown> | null): boolean {
  if (!codingData) return false
  if (codingData.categoryConfirmed === true) return true
  if (codingData.documentTypeSource === "human") return true
  return false
}

/** #297: types whose accounting Direction (Payable/Receivable) is asserted on the document —
 * the field-table's Direction row and the pane's Direction radiogroup both key off this instead
 * of a hand-picked list, so a future type only needs one flag. Purchase Order is category-bearing
 * too, but always Payable (see directionLockedFor) — Bank Statement and every secondary type have
 * no row at all. */
const DIRECTION_FIELD_TYPES: DocType[] = ["invoice", "receipt", "purchase_order"]

export function hasDirectionField(docType: DocType): boolean {
  return DIRECTION_FIELD_TYPES.includes(docType)
}

/** Purchase orders are always payable — the radiogroup renders locked with a visible footnote
 * rather than a real choice (#297). */
export function directionLockedFor(docType: DocType): boolean {
  return docType === "purchase_order"
}

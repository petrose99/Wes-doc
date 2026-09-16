import { DOC_TYPE_SPECS, type DocType, type DocTypeSpec } from "@/lib/doc-types"
import type { DocumentFieldDefinition } from "@/lib/document-templates"

/** #231 Q11 (#252): the field table behind Admin › Configuration › Fields.
 *
 * One pure merge that every consumer reads: the Configuration page renders it, the Detail pane
 * applies `editable` / `required` to the document's field definitions, and each typed queue's
 * system views take their default columns' order and width from it. Two computations of "what
 * does this field do" would drift (the #250 lesson), so there is exactly one.
 *
 * Inputs are the canonical keys for the type (`lib/doc-types.ts`), the type's custom template
 * fields (any non-system `DocumentTemplate` of that type — keys the canonical list does not
 * carry) and the stored overlay rows. The overlay is sparse: a field with no row takes the
 * defaults the code already had, so an untouched workspace renders exactly as before. */

export const FIELD_TABLE_TYPES = ["invoice", "purchase_order", "receipt", "bank_statement"] as const satisfies readonly DocType[]
export type FieldTableType = (typeof FIELD_TABLE_TYPES)[number]

export const FIELD_WIDTHS = ["hidden", "narrow", "normal", "wide"] as const
export type FieldWidth = (typeof FIELD_WIDTHS)[number]

export const FIELD_WIDTH_LABELS: Record<FieldWidth, string> = {
  hidden: "Hidden",
  narrow: "Narrow",
  normal: "Normal",
  wide: "Wide",
}

export type FieldOverlay = {
  fieldKey: string
  editable: boolean
  required: boolean
  width: FieldWidth
  position: number
}

export type CustomFieldSource = {
  key: string
  label: string
  required?: boolean
}

/** What the type's own template says about a field today — the default the table shows and
 * the pane keeps until an owner stores a row. Keyed by field key. */
export type FieldDefaults = Record<string, { required?: boolean }>

export type FieldTableRow = {
  key: string
  label: string
  /** The canonical hint or the custom field's own label — what the row says the field is. */
  hint: string
  custom: boolean
  editable: boolean
  required: boolean
  /** Checks read this field (`checkFields`), so Required cannot be switched off. */
  requiredLocked: boolean
  /** An owner has stored this row; until then the pane keeps the template's own flags. */
  stored: boolean
  width: FieldWidth
  position: number
}

export type FieldTable = {
  docType: FieldTableType
  rows: FieldTableRow[]
}

export function isFieldTableType(value: string | null | undefined): value is FieldTableType {
  return (FIELD_TABLE_TYPES as readonly string[]).includes(value ?? "")
}

export function isFieldWidth(value: unknown): value is FieldWidth {
  return typeof value === "string" && (FIELD_WIDTHS as readonly string[]).includes(value)
}

/** Product words for canonical keys whose sentence-cased key is not the word the queues use
 * (#231 Q25: one supplier vocabulary; "vendor" is the extraction key, never the label). */
const LABEL_OVERRIDES: Record<string, string> = {
  vendor: "Supplier",
  supplier_vat_number: "Supplier VAT number",
  payment_iban: "Payment IBAN",
  po_number: "PO number",
  currency_code: "Currency",
  ship_to: "Ship to",
}
const HINT_OVERRIDES: Record<string, string> = {
  vendor: "Name of the supplier",
  issue_date: "Date the invoice was issued",
  due_date: "Payment due date",
  purchase_date: "Date of purchase",
  order_date: "Order date",
  delivery_date: "Expected delivery date",
  statement_period_start: "First day of the statement period",
  statement_period_end: "Last day of the statement period",
  currency_code: "Currency of the amounts, as a three-letter code",
  other_charges: "Any other charges, each with a description and an amount",
  line_items: "The lines: description, quantity, unit price, amount",
  transactions: "The statement lines: date, description, amount, balance",
  accounts: "Accounts on the statement, with opening and closing balances",
  account_number: "Account number, masked if the statement masks it",
  payment_terms: "Payment terms, for example Net 30",
  supplier_vat_number: "The supplier's VAT or tax number",
  payment_iban: "IBAN the invoice asks to be paid to",
  po_number: "Purchase order reference, if any",
}

/** Sentence-case the canonical key: `invoice_number` → "Invoice number". Custom fields carry
 * their own label; canonical ones only have a key and a hint. */
export function labelForKey(key: string): string {
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key]
  const words = key.split("_").join(" ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function hintForKey(key: string, hint: string): string {
  return HINT_OVERRIDES[key] ?? hint
}

/** The fields a type's identity and arithmetic checks cannot do without — who, which, when,
 * how much, in what currency (and for a statement: which account, which period, the two
 * balances). A reviewer may still be stopped from editing them, but they stay required. The
 * optional check fields (shipping, other charges, VAT number, IBAN) are *not* locked: forcing
 * them required would hold every invoice that has none. */
const LOCKED_CHECK_FIELDS: (keyof NonNullable<DocTypeSpec["checkFields"]>)[] = [
  "supplier", "invoiceNumber", "date", "total", "currency",
  "accountNumber", "periodStart", "periodEnd", "openingBalance", "closingBalance",
]

export function lockedRequiredKeys(docType: FieldTableType): Set<string> {
  const spec = DOC_TYPE_SPECS[docType]
  const keys = new Set<string>()
  for (const name of LOCKED_CHECK_FIELDS) { const value = spec.checkFields?.[name]; if (value) keys.add(value) }
  return keys
}

export function resolveFieldTable(docType: FieldTableType, custom: CustomFieldSource[], overlay: FieldOverlay[], defaults: FieldDefaults = {}): FieldTable {
  const spec = DOC_TYPE_SPECS[docType]
  const locked = lockedRequiredKeys(docType)
  const byKey = new Map(overlay.map((row) => [row.fieldKey, row]))
  const canonicalKeys = new Set(spec.canonicalKeys.map((field) => field.key))
  // A field the overlay does not know (added to the type after the table was saved) lands after
  // everything the owner ordered, in canonical order, rather than at an index that may collide.
  const unstoredBase = overlay.length ? Math.max(...overlay.map((row) => row.position)) + 1 : 0
  const rows: FieldTableRow[] = []
  spec.canonicalKeys.forEach((field, index) => {
    const stored = byKey.get(field.key)
    const requiredLocked = locked.has(field.key)
    rows.push({
      key: field.key,
      label: labelForKey(field.key),
      hint: hintForKey(field.key, field.hint),
      custom: false,
      // Required ⇒ Editable (the pane must be able to fill what it demands).
      editable: (stored?.editable ?? true) || requiredLocked || (stored?.required ?? false),
      required: requiredLocked || (stored?.required ?? defaults[field.key]?.required ?? false),
      requiredLocked,
      stored: !!stored,
      width: stored?.width ?? "normal",
      position: stored?.position ?? unstoredBase + index,
    })
  })
  const seen = new Set<string>()
  custom.forEach((field, index) => {
    if (canonicalKeys.has(field.key) || seen.has(field.key)) return
    seen.add(field.key)
    const stored = byKey.get(field.key)
    rows.push({
      key: field.key,
      label: field.label,
      hint: "Custom field from a document template",
      custom: true,
      editable: (stored?.editable ?? true) || (stored?.required ?? field.required ?? false),
      required: stored?.required ?? field.required ?? false,
      requiredLocked: false,
      stored: !!stored,
      width: stored?.width ?? "normal",
      position: stored?.position ?? unstoredBase + spec.canonicalKeys.length + index,
    })
  })
  rows.sort((a, b) => a.position - b.position || a.key.localeCompare(b.key))
  return { docType, rows: rows.map((row, index) => ({ ...row, position: index })) }
}

/** Applies the table to a document's field definitions for the Detail pane: `required` follows
 * the table, and a field the table marks not editable gains `readOnly`. Fields the table does
 * not know (secondary types, keys from an older template) pass through untouched. */
export type ConfiguredFieldDefinition = DocumentFieldDefinition & { readOnly?: boolean }

export function applyFieldTable(fields: DocumentFieldDefinition[], table: FieldTable | null): ConfiguredFieldDefinition[] {
  if (!table) return fields
  const byKey = new Map(table.rows.map((row) => [row.key, row]))
  return fields.map((field) => {
    const row = byKey.get(field.key)
    // An unstored row changes nothing: the template's own flags stand until an owner decides.
    if (!row || !row.stored) return field
    return { ...field, required: row.required, readOnly: !row.editable || undefined }
  })
}

/** Applies the table to a queue's column list for its system views: columns that name a
 * `fieldKey` follow the table's order, drop out when the width is Hidden and take a width hint;
 * columns without a field key (state, aging, purchase orders) keep their relative order after
 * the field columns. A saved view keeps its own columns — the caller only applies this when no
 * saved view is active. */
export const COLUMN_WIDTH_CLASS: Record<Exclude<FieldWidth, "hidden">, string> = {
  narrow: "max-w-[8rem]",
  normal: "",
  wide: "min-w-[16rem]",
}

export function orderColumnsByFieldTable<T extends { key: string; fieldKey?: string }>(columns: T[], table: FieldTable | null): T[] {
  if (!table) return columns
  const byKey = new Map(table.rows.map((row) => [row.key, row]))
  // The first column is the row's title cell and always leads; the table orders and hides
  // everything after it.
  const [first, ...others] = columns
  if (!first) return columns
  const rowFor = (column: T) => (column.fieldKey ? byKey.get(column.fieldKey) : undefined)
  const fieldColumns = others
    .filter((column) => rowFor(column) && rowFor(column)!.width !== "hidden")
    .sort((a, b) => rowFor(a)!.position - rowFor(b)!.position)
  const rest = others.filter((column) => !rowFor(column))
  return [first, ...fieldColumns, ...rest]
}

export function widthClassFor(table: FieldTable | null, fieldKey: string | undefined): string {
  if (!table || !fieldKey) return ""
  const row = table.rows.find((candidate) => candidate.key === fieldKey)
  if (!row || row.width === "hidden") return ""
  return COLUMN_WIDTH_CLASS[row.width]
}

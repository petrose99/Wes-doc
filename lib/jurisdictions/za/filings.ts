/** ZA VAT201 — return field map and cadence. Rates continue to live in `lib/tax/regions/za.ts`
 * with their retroactive TaxProfileVersion snapshotting (#39); the standard rate is duplicated
 * here as a convenience for the workpaper. */
import type { FilingDraft, FilingField, Rule } from "../types"

const SARS_VAT201 = "https://www.sars.gov.za/guide-to-completing-the-value-added-tax-vat201-return/"

const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

export const zaVat201Fields: FilingField[] = [
  { id: "vat201.1", label: "Standard-rate supplies excl. capital and accommodation (VAT-incl.)", sourceRef: SARS_VAT201 },
  { id: "vat201.1A", label: "Standard-rate supplies of capital goods/services", sourceRef: SARS_VAT201 },
  { id: "vat201.2", label: "Zero-rate supplies (excl. exported goods)", sourceRef: SARS_VAT201 },
  { id: "vat201.2A", label: "Zero-rate exported goods (customs code required)", sourceRef: SARS_VAT201 },
  { id: "vat201.3", label: "Exempt supplies and non-supplies", sourceRef: SARS_VAT201 },
  { id: "vat201.4", label: "Output tax auto-calculated from field 1 (15/115)", sourceRef: SARS_VAT201 },
  { id: "vat201.4A", label: "Output tax auto-calculated from field 1A (15/115)", sourceRef: SARS_VAT201 },
  { id: "vat201.9", label: "Commercial accommodation output tax", sourceRef: SARS_VAT201 },
  { id: "vat201.11", label: "Change-in-use / second-hand exports adjustment output", sourceRef: SARS_VAT201 },
  { id: "vat201.12", label: "Other and imported services output", sourceRef: SARS_VAT201 },
  { id: "vat201.13", label: "Total output tax = 4 + 4A + 9 + 11 + 12", sourceRef: SARS_VAT201 },
  { id: "vat201.14", label: "Input VAT capital domestic", sourceRef: SARS_VAT201 },
  { id: "vat201.14A", label: "Input VAT capital imported", sourceRef: SARS_VAT201 },
  { id: "vat201.15", label: "Input VAT other domestic", sourceRef: SARS_VAT201 },
  { id: "vat201.15A", label: "Input VAT other imported", sourceRef: SARS_VAT201 },
  { id: "vat201.16", label: "Change-in-use input adjustments", sourceRef: SARS_VAT201 },
  { id: "vat201.17", label: "Bad debts (invoice-basis vendors only)", sourceRef: SARS_VAT201 },
  { id: "vat201.18", label: "Other input adjustments", sourceRef: SARS_VAT201 },
  { id: "vat201.19", label: "Total input tax = 14 + 14A + 15 + 15A + 16 + 17 + 18", sourceRef: SARS_VAT201 },
  { id: "vat201.20", label: "VAT payable / (refundable) = 13 − 19", sourceRef: SARS_VAT201 },
]

const OUTPUT_SUM = ["vat201.4", "vat201.4A", "vat201.9", "vat201.11", "vat201.12"] as const
const INPUT_SUM = ["vat201.14", "vat201.14A", "vat201.15", "vat201.15A", "vat201.16", "vat201.17", "vat201.18"] as const

const EPSILON = 0.005

export const zaFilingRules: Rule<FilingDraft>[] = [
  {
    id: "za.vat201.field-13.output-total",
    sourceRef: SARS_VAT201,
    apply: (draft) => {
      if (draft.formId !== "VAT201") return ok
      const expected = OUTPUT_SUM.reduce((sum, k) => sum + (draft.fields[k] ?? 0), 0)
      const declared = draft.fields["vat201.13"]
      if (declared === undefined) return fail("za.vat201.field-13.output-total", "Field 13 (total output tax) is missing.")
      return Math.abs(declared - expected) < EPSILON
        ? ok
        : fail("za.vat201.field-13.output-total", `Field 13 (${declared}) must equal 4 + 4A + 9 + 11 + 12 (${expected}).`)
    },
  },
  {
    id: "za.vat201.field-19.input-total",
    sourceRef: SARS_VAT201,
    apply: (draft) => {
      if (draft.formId !== "VAT201") return ok
      const expected = INPUT_SUM.reduce((sum, k) => sum + (draft.fields[k] ?? 0), 0)
      const declared = draft.fields["vat201.19"]
      if (declared === undefined) return fail("za.vat201.field-19.input-total", "Field 19 (total input tax) is missing.")
      return Math.abs(declared - expected) < EPSILON
        ? ok
        : fail("za.vat201.field-19.input-total", `Field 19 (${declared}) must equal 14 + 14A + 15 + 15A + 16 + 17 + 18 (${expected}).`)
    },
  },
]

export const zaFilings = {
  formId: "VAT201",
  fields: zaVat201Fields,
  standardRate: 0.15,
  /** VAT201 due by the 25th (manual) / last business day (eFiling); we carry the manual day and
   * let the calendar layer resolve business-day arithmetic. */
  dueDay: 25,
  rules: zaFilingRules,
}

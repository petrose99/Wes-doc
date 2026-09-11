/** LS VAT-12 — return field map and cadence. Monthly tax period (Act s.3 definition), return
 * and payment due by the 20th of the following month (s.27(1)); late = 3%/month additional tax
 * (ss.54–55). Rate history stays out of the Act (it's regulation-set per s.19(3)); the workpaper
 * carries the current standard rate for convenience. */
import type { FilingDraft, FilingField, Rule } from "../types"
import { lsInputTaxFields } from "./input-tax"
import { RSL_VAT12_FORM, RSL_VAT_OVERVIEW } from "./invoice-validity"

const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

export const lsOutputFields: FilingField[] = [
  { id: "vat12.1", label: "Taxable sales at 15% (excl. VAT)", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.1v", label: "Output VAT on line 1 (15%)", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.2", label: "Taxable sales at 10% (electricity) (excl. VAT)", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.2v", label: "Output VAT on line 2 (10%)", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.3a", label: "Local zero-rated sales (0%)", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.3b", label: "Exports (0%)", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.4", label: "Total exempt sales", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.5", label: "Total output VAT = 1v + 2v + (3a×0) + (3b×0)", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.6", label: "Value of total sales (4 + 5-amounts)", sourceRef: RSL_VAT12_FORM },
]

export const lsTaxCalcFields: FilingField[] = [
  {
    id: "vat12.10",
    label: "Deductible input VAT (local + import VAT qualifying for credit)",
    sourceRef: RSL_VAT12_FORM,
  },
  { id: "vat12.11", label: "Net VAT payable / refundable = 5 − 10", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.12", label: "VAT refundable (if 11 negative)", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.13", label: "VAT payable (if 11 positive)", sourceRef: RSL_VAT12_FORM },
]

export const lsVat12Fields: FilingField[] = [
  ...lsOutputFields,
  ...lsInputTaxFields,
  {
    id: "vat12.9",
    label: "Total input VAT = 7a-VAT + 7b-VAT + 8a-VAT + 8b-VAT + 8c-VAT + 8d-VAT",
    sourceRef: RSL_VAT12_FORM,
  },
  ...lsTaxCalcFields,
]

const INPUT_VAT_SUM = [
  "vat12.7a",
  "vat12.7b",
  "vat12.8a",
  "vat12.8b",
  "vat12.8c",
  "vat12.8d",
] as const

const EPSILON = 0.005

export const lsFilingRules: Rule<FilingDraft>[] = [
  {
    id: "ls.vat12.field-9.input-total",
    sourceRef: RSL_VAT12_FORM,
    apply: (draft) => {
      if (draft.formId !== "VAT12") return ok
      const expected = INPUT_VAT_SUM.reduce((sum, k) => sum + (draft.fields[k] ?? 0), 0)
      const declared = draft.fields["vat12.9"]
      if (declared === undefined) {
        return fail("ls.vat12.field-9.input-total", "Field 9 (total input VAT) is missing.")
      }
      return Math.abs(declared - expected) < EPSILON
        ? ok
        : fail(
            "ls.vat12.field-9.input-total",
            `Field 9 (${declared}) must equal 7a + 7b + 8a + 8b + 8c + 8d (${expected}).`,
          )
    },
  },
  {
    id: "ls.vat12.field-11.net-vat",
    sourceRef: RSL_VAT12_FORM,
    apply: (draft) => {
      if (draft.formId !== "VAT12") return ok
      const output = draft.fields["vat12.5"]
      const deductible = draft.fields["vat12.10"]
      const declared = draft.fields["vat12.11"]
      if (output === undefined || deductible === undefined || declared === undefined) {
        return fail("ls.vat12.field-11.net-vat", "Fields 5, 10, and 11 are all required to check net VAT.")
      }
      const expected = output - deductible
      return Math.abs(declared - expected) < EPSILON
        ? ok
        : fail(
            "ls.vat12.field-11.net-vat",
            `Field 11 (${declared}) must equal 5 − 10 (${expected}).`,
          )
    },
  },
]

export const lsFilings = {
  formId: "VAT12",
  fields: lsVat12Fields,
  /** Standard rate at the current point in time; regulation-set per s.19(3). Rate history when it
   * arrives will live under `lib/tax/regions/ls.ts` (mirroring ZA). */
  standardRate: 0.15,
  /** VAT-12 return + payment due by the 20th of the following month (s.27(1); RSL). */
  dueDay: 20,
  rules: lsFilingRules,
  /** Reduced electricity rate — carried here so a workpaper can reference the current value
   * without cross-importing from a rates table. */
  reducedRates: [{ id: "ls.electricity", label: "Electricity", rate: 0.1, sourceRef: RSL_VAT_OVERVIEW }],
}

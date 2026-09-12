/** LS VAT Act 2001 s.23 — input VAT is deductible only if the vendor holds a value added tax
 * invoice (or customs bill of entry for imports). The VAT-12 workpaper splits inputs six ways:
 * local goods / local services / imported goods (deferred vs other) / imported services
 * (deferred vs other), feeding lines 7a–8d (see filings.ts). */
import type { FilingField, InputTaxClaim, Rule } from "../types"
import { RSL_VAT12_FORM } from "./invoice-validity"

const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

export const lsInputTaxRules: Rule<InputTaxClaim>[] = [
  {
    id: "ls.s23.4.valid-invoice-held",
    sourceRef: RSL_VAT12_FORM,
    apply: (c) =>
      c.hasValidTaxInvoice
        ? ok
        : fail(
            "ls.s23.4.valid-invoice-held",
            "Input VAT may not be deducted until the vendor holds a valid VAT invoice or customs bill of entry (VAT Act s.23(4)).",
          ),
  },
]

/** VAT-12 input-tax lines (RSL VAT-12 form, notes 3–4). Each line carries Amount + VAT columns
 * on the form; the ids below reference the row, and the workpaper's VAT columns map 1:1 to them. */
export const lsInputTaxFields: FilingField[] = [
  { id: "vat12.7a", label: "Local purchases of goods", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.7b", label: "Local purchases of services", sourceRef: RSL_VAT12_FORM },
  {
    id: "vat12.8a",
    label: "Imported goods (deferred payment / IVCF)",
    sourceRef: RSL_VAT12_FORM,
  },
  {
    id: "vat12.8b",
    label: "Imported services (deferred payment / IVCF)",
    sourceRef: RSL_VAT12_FORM,
  },
  { id: "vat12.8c", label: "Imported goods (other)", sourceRef: RSL_VAT12_FORM },
  { id: "vat12.8d", label: "Imported services (other)", sourceRef: RSL_VAT12_FORM },
]

/** Bucket a claim into the correct VAT-12 field. LS's split is by (isImport, isService,
 * isDeferred) rather than ZA's (isCapital, isImported), so we take a bucket type independent of
 * the shared InputTaxClaim. */
export type LsInputBucket = {
  isImport: boolean
  isService: boolean
  /** IVCF / deferred-payment scheme flag; ignored for local buckets. */
  isDeferred?: boolean
}

export function lsVat12FieldFor(b: LsInputBucket): string {
  if (!b.isImport) return b.isService ? "vat12.7b" : "vat12.7a"
  if (b.isDeferred) return b.isService ? "vat12.8b" : "vat12.8a"
  return b.isService ? "vat12.8d" : "vat12.8c"
}

export const lsInputTax = {
  rules: lsInputTaxRules,
  fields: lsInputTaxFields,
}

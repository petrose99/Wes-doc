/** ZA VAT Act s16(2)(a) — input VAT is deductible only if the vendor holds a valid tax invoice.
 * The VAT201 workpaper must then split claimable input VAT four ways: capital vs non-capital ×
 * domestic vs imported, feeding fields 14 / 14A / 15 / 15A (see filings.ts). */
import type { FilingField, InputTaxClaim, Rule } from "../types"

const SARS_VAT201 = "https://www.sars.gov.za/guide-to-completing-the-value-added-tax-vat201-return/"

const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

export const zaInputTaxRules: Rule<InputTaxClaim>[] = [
  {
    id: "za.s16.2.a.valid-invoice-held",
    sourceRef: "https://www.sars.gov.za/businesses-and-employers/government/tax-invoices/",
    apply: (c) =>
      c.hasValidTaxInvoice
        ? ok
        : fail("za.s16.2.a.valid-invoice-held", "Input VAT may not be deducted unless a valid tax invoice is held (VAT Act s16(2)(a))."),
  },
]

/** VAT201 Part B input-tax fields — the AP subledger routes each claimable line to exactly one of
 * these four boxes by the (capital?, imported?) pair. */
export const zaInputTaxFields: FilingField[] = [
  { id: "vat201.14", label: "Input VAT on capital goods/services (domestic)", sourceRef: SARS_VAT201 },
  { id: "vat201.14A", label: "Input VAT on imported capital goods", sourceRef: SARS_VAT201 },
  { id: "vat201.15", label: "Input VAT on other (non-capital) goods/services (domestic)", sourceRef: SARS_VAT201 },
  { id: "vat201.15A", label: "Input VAT on imported non-capital goods", sourceRef: SARS_VAT201 },
]

/** Route a claim to its VAT201 field. Pure helper so both gates and workpaper agree. */
export function zaVat201FieldFor(claim: Pick<InputTaxClaim, "isCapital" | "isImported">): string {
  if (claim.isCapital) return claim.isImported ? "vat201.14A" : "vat201.14"
  return claim.isImported ? "vat201.15A" : "vat201.15"
}

export const zaInputTax = {
  rules: zaInputTaxRules,
  fields: zaInputTaxFields,
}

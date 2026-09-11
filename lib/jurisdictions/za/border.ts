/** SARS side of the SARS-RSL common-border arrangement (see #43 LS pack for the Lesotho leg).
 *
 * From ZA's perspective the seller supplies a valid ZA tax invoice to a Lesotho buyer; the LRA
 * accepts that invoice at the border to settle Lesotho import VAT when the supplier VAT number
 * matches the 10-digit `^4\d{9}$` shape and the invoice is at most 90 days old. Nothing changes
 * on the ZA VAT201 for these supplies (they remain standard-rated ZA sales); the rule row is
 * present so the border module has a consistent gate-consumable shape across jurisdictions. */
import type { BorderInvoice, Rule } from "../types"

const SARS_RSL = "https://www.sars.gov.za/customs-and-excise/customs-agreements/lesotho/"

const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

const ZA_VAT_NO = /^4\d{9}$/
const MAX_INVOICE_AGE_DAYS = 90

function daysBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000)
}

export const zaBorderRules: Rule<BorderInvoice>[] = [
  {
    id: "za.rsa-rsl.invoice-usable-at-lesotho-border",
    sourceRef: SARS_RSL,
    apply: (b) => {
      if (b.originCountry !== "ZA" || b.destinationCountry !== "LS") return ok
      if (!b.supplierVatNumber || !ZA_VAT_NO.test(b.supplierVatNumber)) {
        return fail(
          "za.rsa-rsl.invoice-usable-at-lesotho-border",
          "Supplier VAT number must be a 10-digit ZA number starting with 4 for the RSA-RSL border arrangement.",
        )
      }
      if (b.issueDate) {
        const today = b.today ?? new Date().toISOString().slice(0, 10)
        if (daysBetween(b.issueDate, today) > MAX_INVOICE_AGE_DAYS) {
          return fail(
            "za.rsa-rsl.invoice-usable-at-lesotho-border",
            `Invoice must be ≤ 90 days old to satisfy Lesotho import-VAT at the RSA-RSL border.`,
          )
        }
      }
      return ok
    },
  },
]

export const zaBorder = {
  id: "sars-rsl-common-border",
  sourceRef: SARS_RSL,
  description:
    "SARS-RSL common-border arrangement: a valid ZA tax invoice from a 10-digit ^4\\d{9}$ VAT vendor, ≤ 90 days old, settles Lesotho import VAT at the border (see LS pack for the buyer-side rules).",
  rules: zaBorderRules,
}

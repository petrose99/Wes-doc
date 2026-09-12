/** LS side of the SARS-RSL common-border arrangement — the buyer-side rules for a Lesotho vendor
 * importing from South Africa (see za/border.ts for the seller-side symmetric rule).
 *
 * Under the arrangement, a valid RSA tax invoice showing 15% SA VAT can be tendered at the
 * border to satisfy Lesotho import VAT; SARS then remits the SA VAT to RSL. The RSL guide
 * ("Guide on Payment of Import VAT on Goods Purchased from RSA") fixes the invoice conditions:
 * 10-digit SA VAT number starting with `4`, original document, and issued within 90 days of the
 * import date. A SARS Exporter/Importer code is separately required; without it the tax-invoice
 * method is refused and VAT is due in cash. That second condition is a workspace-configuration
 * check upstream of a per-bill rule (does the workspace hold a SARS code?) — the rule below
 * covers only the per-invoice conditions. */
import type { BorderInvoice, Rule } from "../types"

const RSL_RSA_GUIDE =
  "https://www.rsl.org.ls/sites/default/files/2026-04/Guide%20on%20payment%20of%20import%20VAT%20on%20goods%20purchased%20from%20South%20Africa.pdf"

const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

const ZA_VAT_NO = /^4\d{9}$/
const MAX_INVOICE_AGE_DAYS = 90

function daysBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000)
}

export const lsBorderRules: Rule<BorderInvoice>[] = [
  {
    id: "ls.rsa-rsl.invoice-payable-at-border",
    sourceRef: RSL_RSA_GUIDE,
    apply: (b) => {
      if (b.originCountry !== "ZA" || b.destinationCountry !== "LS") return ok
      if (!b.supplierVatNumber || !ZA_VAT_NO.test(b.supplierVatNumber)) {
        return fail(
          "ls.rsa-rsl.invoice-payable-at-border",
          "RSA supplier VAT number must be 10 digits starting with 4 for the SARS-RSL border arrangement (RSL guide s.5).",
        )
      }
      if (b.issueDate) {
        const today = b.today ?? new Date().toISOString().slice(0, 10)
        const age = daysBetween(b.issueDate, today)
        if (age > MAX_INVOICE_AGE_DAYS) {
          return fail(
            "ls.rsa-rsl.invoice-payable-at-border",
            `Invoice must be ≤ 90 days old at import to be tendered at the border (RSL guide s.5).`,
          )
        }
        if (age < 0) {
          return fail(
            "ls.rsa-rsl.invoice-payable-at-border",
            "Invoice date is in the future — cannot be tendered at import.",
          )
        }
      }
      return ok
    },
  },
]

export const lsBorder = {
  id: "sars-rsl-common-border",
  sourceRef: RSL_RSA_GUIDE,
  description:
    "SARS-RSL common-border arrangement: a valid RSA tax invoice from a 10-digit ^4\\d{9}$ VAT vendor, ≤ 90 days old at import, can settle Lesotho import VAT at the border. Additionally requires the buyer to hold a SARS Exporter/Importer code (workspace-level check, not enforced here).",
  rules: lsBorderRules,
}

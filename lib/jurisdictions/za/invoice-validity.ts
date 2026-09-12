/** ZA VAT Act s20 — tax invoice validity checks that gate input VAT (see input-tax.ts).
 *
 * Full invoice rules apply when consideration > R5,000 (s20(4)); abridged rules apply for
 * R50 < consideration ≤ R5,000 (s20(5)); ≤ R50 does not require an invoice but a receipt showing
 * VAT (s20(6)) — that leg is enforced by the gate reading `noInvoiceThreshold`, not by rules here.
 *
 * Sources: VAT Act 89 of 1991 s20 and SARS tax-invoices page. */
import type { InvoiceLike, Rule } from "../types"

const SARS_TAX_INVOICES = "https://www.sars.gov.za/businesses-and-employers/government/tax-invoices/"

const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

/** SARS VAT-number format: 10 digits starting with 4 (matches lib/tax/regions/za.ts). Kept local
 * to the rule that needs it so the type stays a plain rule. */
const ZA_VAT_NO = /^4\d{9}$/

export const zaFullInvoiceRules: Rule<InvoiceLike>[] = [
  {
    id: "za.s20.4.a.tax-invoice-wording",
    sourceRef: SARS_TAX_INVOICES,
    apply: (d) =>
      d.hasTaxInvoiceWording
        ? ok
        : fail("za.s20.4.a.tax-invoice-wording", 'Missing "Tax Invoice"/"VAT Invoice"/"Invoice" wording (VAT Act s20(4)(a)).'),
  },
  {
    id: "za.s20.4.b.supplier-identity",
    sourceRef: SARS_TAX_INVOICES,
    apply: (d) => {
      if (!d.supplierName || !d.supplierAddress) return fail("za.s20.4.b.supplier-identity", "Supplier name and address required (s20(4)(b)).")
      if (!d.supplierVatNumber) return fail("za.s20.4.b.supplier-identity", "Supplier VAT registration number required (s20(4)(b)).")
      if (!ZA_VAT_NO.test(d.supplierVatNumber)) return fail("za.s20.4.b.supplier-identity", "Supplier VAT number must be 10 digits starting with 4.")
      return ok
    },
  },
  {
    id: "za.s20.4.c.recipient-identity",
    sourceRef: SARS_TAX_INVOICES,
    apply: (d) => {
      if (!d.recipientName || !d.recipientAddress) return fail("za.s20.4.c.recipient-identity", "Recipient name and address required (s20(4)(c)).")
      if (d.recipientIsRegisteredVendor && !d.recipientVatNumber) {
        return fail("za.s20.4.c.recipient-identity", "Recipient is a registered vendor — VAT number required (s20(4)(c)).")
      }
      return ok
    },
  },
  {
    id: "za.s20.4.d.serial-and-date",
    sourceRef: SARS_TAX_INVOICES,
    apply: (d) =>
      d.invoiceNumber && d.issueDate
        ? ok
        : fail("za.s20.4.d.serial-and-date", "Individual serialised invoice number and date of issue required (s20(4)(d))."),
  },
  {
    id: "za.s20.4.e.description-and-quantity",
    sourceRef: SARS_TAX_INVOICES,
    apply: (d) => {
      if (!d.description) return fail("za.s20.4.e.description-and-quantity", "Accurate description of goods/services required (s20(4)(e)).")
      if (d.quantity === undefined || d.quantity === null) {
        return fail("za.s20.4.e.description-and-quantity", "Quantity or volume supplied required (s20(4)(e)).")
      }
      return ok
    },
  },
  {
    id: "za.s20.4.f-g.value-vat-consideration",
    sourceRef: SARS_TAX_INVOICES,
    apply: (d) => {
      if (d.totalAmount === undefined) return fail("za.s20.4.f-g.value-vat-consideration", "Consideration required (s20(4)(f)/(g)).")
      const showsSplit = d.vatShownSeparately && d.vatAmount !== undefined && d.netAmount !== undefined
      const showsInclusive = d.vatShownSeparately === false && d.totalAmount !== undefined
      if (!showsSplit && !showsInclusive) {
        return fail("za.s20.4.f-g.value-vat-consideration", "Show VAT separately, or state consideration is VAT-inclusive with the rate applied (s20(4)(f)/(g)).")
      }
      return ok
    },
  },
  {
    id: "za.s20.4.currency-zar",
    sourceRef: "https://www.sars.gov.za/wp-content/uploads/Ops/Guides/Legal-Pub-Guide-VAT404-VAT-404-Guide-for-Vendors.pdf",
    apply: (d) => {
      if (d.isZeroRated) return ok // s11 exports may be in foreign currency
      if (!d.currency) return fail("za.s20.4.currency-zar", "Currency required; ZA tax invoices must be in ZAR (VAT Act s20; VAT404 ch. 13).")
      return d.currency === "ZAR" ? ok : fail("za.s20.4.currency-zar", "Tax invoice must be in ZAR unless zero-rated (VAT404 ch. 13).")
    },
  },
]

/** Abridged (s20(5)) — no recipient details, no quantity. Kept as a filtered subset so both rule
 * sets stay declarative and prompt snippets can be shared per ruleId. */
export const zaAbridgedInvoiceRules: Rule<InvoiceLike>[] = zaFullInvoiceRules.filter((r) =>
  !r.id.startsWith("za.s20.4.c.") && !r.id.startsWith("za.s20.4.e."),
)

export const zaInvoiceValidity = {
  fullInvoiceThreshold: { currency: "ZAR", amount: 5000 },
  noInvoiceThreshold: { currency: "ZAR", amount: 50 },
  fullInvoiceRules: zaFullInvoiceRules,
  abridgedInvoiceRules: zaAbridgedInvoiceRules,
}

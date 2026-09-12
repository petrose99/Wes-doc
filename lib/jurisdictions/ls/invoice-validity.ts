/** LS VAT Act 2001 s.24 + Schedule III — tax-invoice validity checks that gate input VAT via
 * s.23(4). The Act does not carve out an "abridged" invoice regime the way ZA s20(5) does; every
 * tax invoice must carry the Schedule III particulars. `abridgedInvoiceRules` is an alias for the
 * full set so the shared JurisdictionPack shape stays populated. */
import type { InvoiceLike, Rule } from "../types"

const RSL_VAT12_FORM = "http://www.rsl.org.ls/sites/default/files/2024-07/VALUE%20ADDED%20TAX%20RETURN.pdf"
const RSL_VAT_OVERVIEW = "https://www.rsl.org.ls/value-added-tax-vat"

const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

/** LS TIN format: the Act does not fix a shape, but RSL's practical guidance treats the TIN as a
 * numeric identifier. The rule below only checks presence + non-empty; digit-shape validation is
 * left to a future TIN check. */
export const lsFullInvoiceRules: Rule<InvoiceLike>[] = [
  {
    id: "ls.s24.8.a.tax-invoice-wording",
    sourceRef: RSL_VAT12_FORM,
    apply: (d) =>
      d.hasTaxInvoiceWording
        ? ok
        : fail(
            "ls.s24.8.a.tax-invoice-wording",
            'Missing "value added tax invoice" wording (VAT Act s.24(8), Schedule III para 1(a)).',
          ),
  },
  {
    id: "ls.s24.8.b.supplier-identity",
    sourceRef: RSL_VAT12_FORM,
    apply: (d) => {
      if (!d.supplierName || !d.supplierAddress) {
        return fail(
          "ls.s24.8.b.supplier-identity",
          "Supplier commercial name and address required (Schedule III para 1(b)).",
        )
      }
      if (!d.supplierVatNumber) {
        return fail(
          "ls.s24.8.b.supplier-identity",
          "Supplier TIN required on a Lesotho tax invoice (Schedule III para 1(b)).",
        )
      }
      return ok
    },
  },
  {
    id: "ls.s24.8.c.recipient-identity",
    sourceRef: RSL_VAT12_FORM,
    apply: (d) => {
      if (!d.recipientName || !d.recipientAddress) {
        return fail(
          "ls.s24.8.c.recipient-identity",
          "Recipient commercial name and address required (Schedule III para 1(c)).",
        )
      }
      if (d.recipientIsRegisteredVendor && !d.recipientVatNumber) {
        return fail(
          "ls.s24.8.c.recipient-identity",
          "Recipient is a registered vendor — TIN required (Schedule III para 1(c)).",
        )
      }
      return ok
    },
  },
  {
    id: "ls.s24.8.d.serial-and-date",
    sourceRef: RSL_VAT12_FORM,
    apply: (d) =>
      d.invoiceNumber && d.issueDate
        ? ok
        : fail(
            "ls.s24.8.d.serial-and-date",
            "Individualised invoice number and date of issue required (Schedule III para 1(d)).",
          ),
  },
  {
    id: "ls.s24.8.e.description-and-quantity",
    sourceRef: RSL_VAT12_FORM,
    apply: (d) => {
      if (!d.description) {
        return fail(
          "ls.s24.8.e.description-and-quantity",
          "Description of goods/services required (Schedule III para 1(e)).",
        )
      }
      if (d.quantity === undefined || d.quantity === null) {
        return fail(
          "ls.s24.8.e.description-and-quantity",
          "Quantity or volume supplied required (Schedule III para 1(f)).",
        )
      }
      return ok
    },
  },
  {
    id: "ls.s24.8.f-g.value-vat-consideration",
    sourceRef: RSL_VAT12_FORM,
    apply: (d) => {
      if (d.totalAmount === undefined) {
        return fail(
          "ls.s24.8.f-g.value-vat-consideration",
          "Consideration required (Schedule III para 1(g)).",
        )
      }
      const showsSplit =
        d.vatShownSeparately && d.vatAmount !== undefined && d.netAmount !== undefined
      const showsInclusive = d.vatShownSeparately === false && d.totalAmount !== undefined
      if (!showsSplit && !showsInclusive) {
        return fail(
          "ls.s24.8.f-g.value-vat-consideration",
          "Show VAT separately, or state consideration is VAT-inclusive with the rate applied (Schedule III para 1(g)).",
        )
      }
      return ok
    },
  },
]

/** LS has no abridged regime; the shared JurisdictionPack shape wants a rule array here, so we
 * point it at the full set. If future guidance introduces a lighter category, split this here. */
export const lsAbridgedInvoiceRules: Rule<InvoiceLike>[] = lsFullInvoiceRules

export const lsInvoiceValidity = {
  fullInvoiceRules: lsFullInvoiceRules,
  abridgedInvoiceRules: lsAbridgedInvoiceRules,
  /** LS does not have a threshold-driven abridged regime — the shared shape allows omitting the
   * threshold fields, so we leave them out. */
} satisfies {
  fullInvoiceRules: Rule<InvoiceLike>[]
  abridgedInvoiceRules: Rule<InvoiceLike>[]
}

export { RSL_VAT12_FORM, RSL_VAT_OVERVIEW }

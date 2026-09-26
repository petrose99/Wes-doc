import { BillMappingError, type NormalizedBill } from "@/lib/integration-bill-mapping"

const LINE_AMOUNT_TYPES = { inclusive: "Inclusive", exclusive: "Exclusive", none: "NoTax" } as const

/** Builds the exact request body for `POST https://api.xero.com/api.xro/2.0/Invoices` with
 * `Type: "ACCPAY"` (Xero's accounts-payable bill). `contactId` is resolved by the caller
 * (find-or-create contact) before mapping. #429: each line posts to its OWN
 * `item.accountExternalId` (supplier rule → connection Default, resolved per line before the bill
 * reaches here) rather than one account shared by the whole bill. A line with no resolved account
 * is a mapping error — post eligibility (lib/integration-push-selection.ts) is meant to have
 * already refused this document, so reaching here means that check was bypassed or is stale.
 *
 * ADR 0014: Xero takes Tracking by name, so the snapshot's names are sent; a category or option
 * renamed in Xero between enqueue and retry is rejected by Xero and lands on the permanent path
 * (a review task) — accepted rather than special-cased. A null basis never reaches here
 * (tax_basis_unclear blocks the push) and is treated as none. */
export function toXeroBillBody(bill: NormalizedBill, contactId: string) {
  const basis = bill.taxBasis ?? "none"
  return {
    Type: "ACCPAY",
    Contact: { ContactID: contactId },
    ...(bill.issueDate ? { Date: bill.issueDate } : {}),
    ...(bill.dueDate ? { DueDate: bill.dueDate } : {}),
    ...(bill.referenceNumber ? { InvoiceNumber: bill.referenceNumber } : {}),
    ...(bill.currencyCode ? { CurrencyCode: bill.currencyCode } : {}),
    LineAmountTypes: LINE_AMOUNT_TYPES[basis],
    LineItems: bill.lineItems.map((item) => {
      if (!item.accountExternalId && !item.itemExternalId) throw new BillMappingError("line_missing_account")
      return {
        Description: item.description,
        Quantity: item.quantity || 1,
        UnitAmount: item.unitPrice,
        // #459/ADR 0015: an item line still sends AccountCode — it's the Item's own account,
        // resolved read-only, not the ledger computing it the way QuickBooks does.
        ...(item.itemExternalId ? { ItemCode: item.itemExternalId } : {}),
        ...(item.accountExternalId ? { AccountCode: item.accountExternalId } : {}),
        ...(basis !== "none" && item.taxCode ? { TaxType: item.taxCode } : {}),
        ...(item.tracking.length ? { Tracking: item.tracking.map((t) => ({ Name: t.categoryName, Option: t.optionName })) } : {}),
      }
    }),
    Status: "AUTHORISED",
  }
}

import { BillMappingError, type NormalizedBill } from "@/lib/integration-bill-mapping"

/** Builds the exact request body for `POST https://api.xero.com/api.xro/2.0/Invoices` with
 * `Type: "ACCPAY"` (Xero's accounts-payable bill). `contactId` is resolved by the caller
 * (find-or-create contact) before mapping. #429: each line posts to its OWN
 * `item.accountExternalId` (supplier rule → connection Default, resolved per line before the bill
 * reaches here) rather than one account shared by the whole bill. A line with no resolved account
 * is a mapping error — post eligibility (lib/integration-push-selection.ts) is meant to have
 * already refused this document, so reaching here means that check was bypassed or is stale. */
export function toXeroBillBody(bill: NormalizedBill, contactId: string) {
  return {
    Type: "ACCPAY",
    Contact: { ContactID: contactId },
    ...(bill.issueDate ? { Date: bill.issueDate } : {}),
    ...(bill.dueDate ? { DueDate: bill.dueDate } : {}),
    ...(bill.referenceNumber ? { InvoiceNumber: bill.referenceNumber } : {}),
    ...(bill.currencyCode ? { CurrencyCode: bill.currencyCode } : {}),
    LineItems: bill.lineItems.map((item) => {
      if (!item.accountExternalId) throw new BillMappingError("line_missing_account")
      return {
        Description: item.description,
        Quantity: item.quantity || 1,
        UnitAmount: item.unitPrice,
        AccountCode: item.accountExternalId,
      }
    }),
    Status: "AUTHORISED",
  }
}

import { BillMappingError, type NormalizedBill } from "@/lib/integration-bill-mapping"

/** Builds the exact request body for `POST /v3/company/{realmId}/bill`. `vendorRef` is a
 * QuickBooks entity id, resolved by the caller (find-or-create vendor) before mapping — this
 * function is pure JSON shaping, no network. #429: each line posts to its OWN
 * `item.accountExternalId` (supplier rule → connection Default, resolved per line before the bill
 * reaches here) rather than one account shared by the whole bill. A line with no resolved account
 * is a mapping error — post eligibility (lib/integration-push-selection.ts) is meant to have
 * already refused this document, so reaching here means that check was bypassed or is stale. */
export function toQuickBooksBillBody(bill: NormalizedBill, vendorRef: string) {
  return {
    VendorRef: { value: vendorRef },
    ...(bill.dueDate ? { DueDate: bill.dueDate } : {}),
    ...(bill.issueDate ? { TxnDate: bill.issueDate } : {}),
    ...(bill.referenceNumber ? { DocNumber: bill.referenceNumber.slice(0, 21) } : {}),
    ...(bill.currencyCode ? { CurrencyRef: { value: bill.currencyCode } } : {}),
    TotalAmt: bill.total,
    Line: bill.lineItems.map((item) => {
      if (!item.accountExternalId) throw new BillMappingError("line_missing_account")
      return {
        Amount: item.amount,
        DetailType: "AccountBasedExpenseLineDetail",
        Description: item.description,
        AccountBasedExpenseLineDetail: { AccountRef: { value: item.accountExternalId } },
      }
    }),
  }
}

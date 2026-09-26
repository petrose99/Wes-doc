import { BillMappingError, type NormalizedBill } from "@/lib/integration-bill-mapping"

const GLOBAL_TAX = { inclusive: "TaxInclusive", exclusive: "TaxExcluded", none: "NotApplicable" } as const

/** Builds the exact request body for `POST /v3/company/{realmId}/bill`. `vendorRef` is a
 * QuickBooks entity id, resolved by the caller (find-or-create vendor) before mapping — this
 * function is pure JSON shaping, no network. #429: each line posts to its OWN
 * `item.accountExternalId` (supplier rule → connection Default, resolved per line before the bill
 * reaches here) rather than one account shared by the whole bill. A line with no resolved account
 * is a mapping error — post eligibility (lib/integration-push-selection.ts) is meant to have
 * already refused this document, so reaching here means that check was bypassed or is stale.
 *
 * ADR 0014: when VAT applies, TotalAmt is left out so QuickBooks computes the total and VAT from
 * each line's TaxCodeRef; the post read-back compares them with the invoice. A null basis never
 * reaches here (tax_basis_unclear blocks the push) and is treated as none. QuickBooks takes one
 * Class per line, so the line's first tracking selection is its Class. */
export function toQuickBooksBillBody(bill: NormalizedBill, vendorRef: string) {
  const basis = bill.taxBasis ?? "none"
  return {
    VendorRef: { value: vendorRef },
    ...(bill.dueDate ? { DueDate: bill.dueDate } : {}),
    ...(bill.issueDate ? { TxnDate: bill.issueDate } : {}),
    ...(bill.referenceNumber ? { DocNumber: bill.referenceNumber.slice(0, 21) } : {}),
    ...(bill.currencyCode ? { CurrencyRef: { value: bill.currencyCode } } : {}),
    ...(bill.location ? { DepartmentRef: { value: bill.location } } : {}),
    GlobalTaxCalculation: GLOBAL_TAX[basis],
    ...(basis === "none" ? { TotalAmt: bill.total } : {}),
    Line: bill.lineItems.map((item) => {
      if (!item.accountExternalId && !item.itemExternalId) throw new BillMappingError("line_missing_account")
      // #459/ADR 0015: an item line has no AccountRef — QuickBooks computes it from the Item.
      if (item.itemExternalId) {
        return {
          Amount: item.amount,
          DetailType: "ItemBasedExpenseLineDetail",
          Description: item.description,
          ItemBasedExpenseLineDetail: {
            ItemRef: { value: item.itemExternalId },
            Qty: item.quantity,
            UnitPrice: item.unitPrice,
            ...(basis !== "none" && item.taxCode ? { TaxCodeRef: { value: item.taxCode } } : {}),
            ...(item.tracking[0] ? { ClassRef: { value: item.tracking[0].optionId } } : {}),
            ...(item.customer ? { CustomerRef: { value: item.customer } } : {}),
            ...(item.billable ? { BillableStatus: "Billable" } : {}),
          },
        }
      }
      return {
        Amount: item.amount,
        DetailType: "AccountBasedExpenseLineDetail",
        Description: item.description,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: item.accountExternalId },
          ...(basis !== "none" && item.taxCode ? { TaxCodeRef: { value: item.taxCode } } : {}),
          ...(item.tracking[0] ? { ClassRef: { value: item.tracking[0].optionId } } : {}),
          ...(item.customer ? { CustomerRef: { value: item.customer } } : {}),
          ...(item.billable ? { BillableStatus: "Billable" } : {}),
        },
      }
    }),
  }
}

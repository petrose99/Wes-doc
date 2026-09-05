import type { NormalizedBill } from "@/lib/integration-bill-mapping"

export function toBigcapitalInvoiceBody(bill: NormalizedBill, customerId: string, itemId: string) {
  return {
    customer_id: Number(customerId),
    invoice_date: bill.issueDate ?? new Date().toISOString().slice(0, 10),
    ...(bill.dueDate ? { due_date: bill.dueDate } : {}),
    ...(bill.referenceNumber ? { invoice_no: bill.referenceNumber.slice(0, 50) } : {}),
    ...(bill.currencyCode ? { currency_code: bill.currencyCode } : {}),
    delivered: true,
    entries: bill.lineItems.map((item, index) => ({
      index: index + 1,
      item_id: Number(itemId),
      description: item.description,
      quantity: 1,
      rate: item.amount,
    })),
  }
}

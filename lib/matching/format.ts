import { formatCurrency } from "@/lib/money"
/** Number formatting the PO-compare surfaces share, on both server and client. */

export function formatQuantity(value: number | null): string {
  if (value === null) return "—"
  return new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(value)
}

export function formatAmount(value: number | null, currency?: string | null): string {
  return formatCurrency(value, currency)
}

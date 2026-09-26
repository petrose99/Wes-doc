import { formatCurrency } from "@/lib/money"
/** #251: money and dates on the Payments destination. Whole cents (a discount is a cents
 * difference), and the workspace's base currency as the fallback — never USD on a ZA file (the
 * incumbent's `formatMoney` fell back to "$", a P1 on its critique). */
export function formatPaymentMoney(amount: number, currency: string | null | undefined, fallbackCurrency: string): string {
  return formatCurrency(amount, currency && /^[A-Z]{3}$/i.test(currency) ? currency : fallbackCurrency)
}

export function formatPaymentDate(date: Date | null | undefined): string {
  if (!date) return "—"
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(date)
}

export function formatPaymentDateTime(date: Date | null | undefined): string {
  if (!date) return "—"
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
}

/** `YYYY-MM-DD` for a date input's value, in local time. */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

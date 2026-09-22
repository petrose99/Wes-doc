/** Number formatting the PO-compare surfaces share, on both server and client. */

export function formatQuantity(value: number | null): string {
  if (value === null) return "—"
  return new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(value)
}

export function formatAmount(value: number | null, currency?: string | null): string {
  if (value === null) return "—"
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : null
  try {
    return code
      ? new Intl.NumberFormat("en", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value)
      : new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  } catch {
    return value.toFixed(2)
  }
}

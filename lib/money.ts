/** Money helpers.
 *
 * Reconciliation and readiness math on chained Floats drifts — 0.1 + 0.2 = 0.30000000000000004.
 * Amounts stored on ledger/expense/budget rows are Decimal(18,2) columns; this module is the
 * boundary that (a) hands them out as safe integer cents when arithmetic happens, and (b) converts
 * back to `number` at the Prisma read boundary so the rest of the codebase — which speaks plain
 * `number | null` — keeps working unchanged.
 *
 * The rule of thumb: sum, subtract, compare, or apply a tolerance to two amounts? Convert to
 * cents first, do the math on cents, format at the edge. */

/** Prisma returns Decimal columns as its own Decimal.js-backed instance whose only reliable
 * cross-runtime shape is `.toString()` (its `.toNumber()` isn't in the type when the runtime
 * client is mocked). We accept anything Prisma might hand us and coerce safely. */
export type PrismaDecimalLike =
  | { toNumber: () => number }
  | { toString: () => string }
  | number
  | string
  | null
  | undefined

/** Boundary helper: convert a Prisma Decimal (or null) into `number | null`.
 *
 * Callers already tolerate a plain `number` (or `null`) so this widens the read boundary without
 * spreading `.toNumber()` calls through every read site. */
export function decimalToNumber(value: PrismaDecimalLike): number | null {
  if (value == null) return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof (value as { toNumber?: () => number }).toNumber === "function") {
    const n = (value as { toNumber: () => number }).toNumber()
    return Number.isFinite(n) ? n : null
  }
  const parsed = Number((value as { toString: () => string }).toString())
  return Number.isFinite(parsed) ? parsed : null
}

/** Same as decimalToNumber but for callers that only ever store a NOT-NULL column. */
export function decimalToNumberOrZero(value: PrismaDecimalLike): number {
  return decimalToNumber(value) ?? 0
}

/** Convert a decimal amount (dollars) to integer cents. Rounds to the nearest cent — the
 * closest banker's-style rounding the caller might want is not in scope for a codebase that
 * accepts a stray hundredth-of-a-cent as noise. */
export function toCents(amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

/** Convert integer cents back to a decimal amount. */
export function fromCents(cents: number): number {
  return cents / 100
}

/** Sum a list of amounts (dollars) at cent precision, returning cents. Use `fromCents` on the
 * way out if a caller needs dollars. */
export function addCents(amounts: Array<number | null | undefined>): number {
  let total = 0
  for (const a of amounts) total += toCents(a)
  return total
}

/** Compare two dollar amounts for equality inside a basis-points tolerance.
 * `tolBps` is basis points OF THE LARGER SIDE — 200 = 2% (this codebase's existing matching
 * tolerance in lib/matching/engine.ts). Pass 0 for exact-cent equality. */
export function amountsEqualCents(
  a: number | null | undefined,
  b: number | null | undefined,
  tolBps = 0,
): boolean {
  const ca = toCents(a)
  const cb = toCents(b)
  if (tolBps === 0) return ca === cb
  const max = Math.max(Math.abs(ca), Math.abs(cb))
  const tolerance = Math.ceil((max * tolBps) / 10_000)
  return Math.abs(ca - cb) <= tolerance
}

/** Format an amount for display. Intentionally minimal — a real currency-aware formatter lives
 * in the UI layer; this is a debugging/log helper. */
export function formatMoney(amount: number | null | undefined, currencyCode?: string | null): string {
  if (amount == null || !Number.isFinite(amount)) return "-"
  const fixed = amount.toFixed(2)
  return currencyCode ? `${fixed} ${currencyCode}` : fixed
}

/** #457 spec §4: the one display formatter for money, `LSL 1,234.50`. ISO code, a no-break
 * space, `en` grouping, the minus after the code (`LSL -1,234.50`), 2 decimals (0 for summary
 * totals). Any ISO code: a supplier document may be in USD while the company runs in LSL.
 * ponytail: a missing or non-ISO code prints the bare number rather than guessing a currency;
 * callers that know the company currency pass it as the fallback (`doc ?? company`). */
export function formatCurrency(amount: number | null | undefined, code: string | null | undefined, digits: 0 | 2 = 2): string {
  if (amount == null || !Number.isFinite(amount)) return "—"
  const number = new Intl.NumberFormat("en", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount)
  const currency = code && /^[A-Za-z]{3}$/.test(code) ? code.toUpperCase() : null
  return currency ? `${currency} ${number}` : number
}

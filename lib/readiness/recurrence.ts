/** A1.5: recurring-invoice detection. A monthly SaaS bill for the same amount from the same
 * supplier is one of the safest touchless candidates — pattern-matching a document against a
 * supplier's history proves both the amount and the cadence are business-as-usual. Pure
 * function over a document's amount/date and the supplier's prior comparable dates+amounts.
 *
 * Cadence: monthly (25-35 days) OR weekly (5-9 days), inferred from the last N gaps. Amount:
 * within +/-2% (rate hikes and prorations happen — 2% is loose enough for real invoices, tight
 * enough to catch a wrong-supplier fluke). Requires >=3 prior comparable documents. */

export type RecurrenceInput = {
  /** The candidate document's amount + issue date. */
  amount: number | null
  date: Date | null
  /** Same supplier's prior comparable (issue-date, amount) pairs — oldest last. Caller filters. */
  history: { date: Date; amount: number }[]
}

export type RecurrenceVerdict = {
  isRecurring: boolean
  /** "monthly" | "weekly" | null. */
  cadence: "monthly" | "weekly" | null
  meanAmount: number | null
  amountTolerancePct: number
  reason: string
}

export const RECURRENCE_MIN_HISTORY = 3
export const AMOUNT_TOLERANCE_PCT = 2

const MONTHLY_MIN_DAYS = 25
const MONTHLY_MAX_DAYS = 35
const WEEKLY_MIN_DAYS = 5
const WEEKLY_MAX_DAYS = 9

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000)
}

function inferCadence(gaps: number[]): "monthly" | "weekly" | null {
  if (gaps.every((g) => g >= MONTHLY_MIN_DAYS && g <= MONTHLY_MAX_DAYS)) return "monthly"
  if (gaps.every((g) => g >= WEEKLY_MIN_DAYS && g <= WEEKLY_MAX_DAYS)) return "weekly"
  return null
}

export function detectRecurrence(input: RecurrenceInput): RecurrenceVerdict {
  if (input.amount === null || !input.date || input.history.length < RECURRENCE_MIN_HISTORY) {
    return { isRecurring: false, cadence: null, meanAmount: null, amountTolerancePct: AMOUNT_TOLERANCE_PCT, reason: "insufficient_history" }
  }
  const sorted = [...input.history].sort((a, b) => a.date.getTime() - b.date.getTime())
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i].date, sorted[i - 1].date))
  gaps.push(daysBetween(input.date, sorted[sorted.length - 1].date))

  const cadence = inferCadence(gaps)
  if (!cadence) {
    return { isRecurring: false, cadence: null, meanAmount: null, amountTolerancePct: AMOUNT_TOLERANCE_PCT, reason: "cadence_not_monthly_or_weekly" }
  }

  const meanAmount = sorted.reduce((sum, h) => sum + h.amount, 0) / sorted.length
  if (meanAmount === 0) {
    return { isRecurring: false, cadence, meanAmount: 0, amountTolerancePct: AMOUNT_TOLERANCE_PCT, reason: "zero_mean" }
  }
  const drift = Math.abs(input.amount - meanAmount) / Math.abs(meanAmount) * 100
  if (drift > AMOUNT_TOLERANCE_PCT) {
    return { isRecurring: false, cadence, meanAmount, amountTolerancePct: AMOUNT_TOLERANCE_PCT, reason: "amount_off_pattern" }
  }
  return { isRecurring: true, cadence, meanAmount, amountTolerancePct: AMOUNT_TOLERANCE_PCT, reason: `matches_${cadence}_pattern` }
}

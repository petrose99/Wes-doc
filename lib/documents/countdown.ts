/** #208: one countdown-urgency model, shared by every deadline pill in the app. Today that's
 * exactly two deadlines with real data behind them — an invoice's due date (see
 * `models/bills.ts`) and an open review task's age against a fixed SLA (see `models/bills.ts` /
 * `models/receipts.ts`). Close-period and discount-lapse deadlines are explicitly out of scope
 * per #208 — neither has a stored deadline in the schema today.
 *
 * Copy follows Vic.ai's wording: "12 Days Away" while there's runway, "Expires in X Days" inside
 * the warning window, "X Days Overdue" once it's past. Colour is never the only signal — the
 * label is the full sentence at every breakpoint (#187), and the three urgency buckets (blue
 * upcoming / purple expiring / red overdue) are read off `urgency`, not inferred from the text. */

export type CountdownUrgency = "upcoming" | "expiring" | "overdue"

export type CountdownResult = {
  urgency: CountdownUrgency
  /** Always >= 0 — "days away" while upcoming/expiring, "days overdue" once past. */
  days: number
  label: string
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

const plural = (n: number) => (n === 1 ? "Day" : "Days")

/** `expiringWithinDays` is the width of the warning window before the deadline — the countdown
 * badge switches from "upcoming" (blue) to "expiring" (purple) once this many days of runway
 * remain, and to "overdue" (red) once the deadline has passed. Returns null when there's no
 * deadline to count down to. */
export function resolveCountdown(deadline: Date | null, asOf: Date, expiringWithinDays = 3): CountdownResult | null {
  if (!deadline) return null
  const daysUntil = Math.ceil((deadline.getTime() - asOf.getTime()) / MS_PER_DAY)

  if (daysUntil < 0) {
    const days = -daysUntil
    return { urgency: "overdue", days, label: `${days} ${plural(days)} Overdue` }
  }
  if (daysUntil <= expiringWithinDays) {
    const label = daysUntil === 0 ? "Expires Today" : `Expires in ${daysUntil} ${plural(daysUntil)}`
    return { urgency: "expiring", days: daysUntil, label }
  }
  return { urgency: "upcoming", days: daysUntil, label: `${daysUntil} ${plural(daysUntil)} Away` }
}

/** Review-SLA clock: the age of a document's oldest still-open review task against a fixed
 * budget. There is no per-workspace configurable SLA setting in the schema today (#208 leaves
 * that as future scope) — `slaHours` is a shared constant so every consumer agrees on the same
 * clock. Returns null once there's no open review task to time (`openedAt` is null). */
export function resolveReviewSlaCountdown(openedAt: Date | null, asOf: Date, slaHours: number, expiringWithinDays = 1): CountdownResult | null {
  if (!openedAt) return null
  const deadline = new Date(openedAt.getTime() + slaHours * 60 * 60 * 1000)
  return resolveCountdown(deadline, asOf, expiringWithinDays)
}

/** The default review SLA budget: two business-hours days. Not workspace-configurable today —
 * there's no settings model for it, and adding one is out of #208's scope. */
export const DEFAULT_REVIEW_SLA_HOURS = 48

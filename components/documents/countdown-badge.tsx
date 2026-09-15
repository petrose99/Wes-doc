import { resolveCountdown, resolveReviewSlaCountdown, type CountdownUrgency } from "@/lib/documents/countdown"

/** #208: one pill shape for every deadline in the app — blue while there's runway, purple inside
 * the warning window, red once it's overdue. Per #187, colour is never the only signal: the full
 * sentence ("12 Days Away" / "Expires in 2 Days" / "3 Days Overdue") renders at every breakpoint,
 * so screen readers and colour-blind reviewers get the same information sighted reviewers scanning
 * for the accent colour do. */
const URGENCY_CLASS: Record<CountdownUrgency, string> = {
  upcoming: "bg-blue-50 text-blue-700",
  expiring: "bg-purple-50 text-purple-700",
  overdue: "bg-red-50 text-red-800",
}

function Pill({ urgency, label }: { urgency: CountdownUrgency; label: string }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${URGENCY_CLASS[urgency]}`}>{label}</span>
}

/** A due-date countdown — the Invoices row-level replacement for the 5-bucket aging ramp
 * (`AgingBadge` in `components/typed-destinations/row-signals.tsx`) that only ever rendered
 * "N-M days overdue". `expiringWithinDays` defaults to 3, matching the AP aging chart's habit of
 * treating anything inside a few days of due as needing attention rather than merely tracked. */
export function DueDateCountdownBadge({ dueDate, asOf, expiringWithinDays = 3, fallback = "—" }: {
  dueDate: Date | null
  asOf?: Date
  expiringWithinDays?: number
  fallback?: string
}) {
  const result = resolveCountdown(dueDate, asOf ?? new Date(), expiringWithinDays)
  if (!result) return <span className="text-xs text-slate-400">{fallback}</span>
  return <Pill urgency={result.urgency} label={result.label} />
}

/** A review-SLA countdown, timed from when a document's still-open review task was created
 * (`openedAt`) against a fixed budget (`slaHours` — see `DEFAULT_REVIEW_SLA_HOURS`). Renders
 * nothing once there's no open review task to time, so it never claims a deadline the pipeline
 * doesn't actually have. */
export function ReviewSlaCountdownBadge({ openedAt, asOf, slaHours, expiringWithinDays = 1 }: {
  openedAt: Date | null
  asOf?: Date
  slaHours: number
  expiringWithinDays?: number
}) {
  const result = resolveReviewSlaCountdown(openedAt, asOf ?? new Date(), slaHours, expiringWithinDays)
  if (!result) return null
  return <Pill urgency={result.urgency} label={result.label} />
}

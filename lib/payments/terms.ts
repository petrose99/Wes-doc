/** #229 Q5 (#251): a supplier's *Payment terms* — net days and, when offered, an early-payment
 * discount — rendered as "2/10 net 30" (AP convention; Vic's "2-10-30" is skin). The discount
 * applies while `asOf` ≤ invoice date + discount days; outside that window the amount to pay is
 * the full due and there is no countdown, so the purple badge never claims a deadline that has
 * passed or never existed (Intent: no fabricated urgency). Money maths in cents. */

export type PaymentTerms = {
  netDays: number | null
  discountPercent: number | null
  discountDays: number | null
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

export function hasDiscountTerms(terms: PaymentTerms): boolean {
  return terms.discountPercent !== null && terms.discountPercent > 0 && terms.discountDays !== null && terms.discountDays >= 0
}

/** "2/10 net 30" · "Net 30" · "2/10" (a discount with no net days is unusual but honest) · "—". */
export function formatTerms(terms: PaymentTerms): string {
  const discount = hasDiscountTerms(terms) ? `${trimPercent(terms.discountPercent!)}/${terms.discountDays}` : null
  const net = terms.netDays !== null ? (terms.netDays === 0 ? "Due on receipt" : `net ${terms.netDays}`) : null
  if (discount && net) return `${discount} ${net}`
  if (discount) return discount
  if (net) return net === "Due on receipt" ? net : `Net ${terms.netDays}`
  return "—"
}

function trimPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "")
}

/** The last day the discount can be taken, or null when there is no discount or no invoice date
 * to count from. */
export function discountDeadline(invoiceDate: Date | null, terms: PaymentTerms): Date | null {
  if (!invoiceDate || !hasDiscountTerms(terms)) return null
  return new Date(invoiceDate.getTime() + terms.discountDays! * MS_PER_DAY)
}

export type DiscountWindow = {
  /** The deadline, when the discount is still open as of `asOf`. */
  deadline: Date
  daysLeft: number
  discountPercent: number
  /** Whole-cent amounts. */
  discountAmount: number
  discountedTotal: number
}

/** The open discount window as of `asOf`, or null once it has closed (or never existed). A window
 * closes at the end of the deadline day: `daysLeft` is 0 on the deadline itself. */
export function openDiscountWindow(input: { total: number | null; invoiceDate: Date | null; terms: PaymentTerms; asOf: Date }): DiscountWindow | null {
  const deadline = discountDeadline(input.invoiceDate, input.terms)
  if (!deadline || input.total === null || input.total <= 0) return null
  const daysLeft = Math.floor((startOfDay(deadline).getTime() - startOfDay(input.asOf).getTime()) / MS_PER_DAY)
  if (daysLeft < 0) return null
  const cents = Math.round(input.total * 100)
  const discountCents = Math.round(cents * input.terms.discountPercent! / 100)
  return {
    deadline,
    daysLeft,
    discountPercent: input.terms.discountPercent!,
    discountAmount: discountCents / 100,
    discountedTotal: (cents - discountCents) / 100,
  }
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

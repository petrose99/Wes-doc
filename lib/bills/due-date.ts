/** Pure due-date inference for AP aging. When an extracted invoice carries an explicit `due_date`
 * that is what wins; when it doesn't, the supplier's paymentTermsDays (WP-AP2) applied to the
 * invoice date is the fallback. Null when neither signal is available.
 *
 * Kept pure (no Prisma import) so the aging view, the bills API, and any future payment-run
 * pre-flight all speak the same due date without disagreeing on precedence. */

export function inferDueDate(input: {
  extractedDueDate: Date | null
  documentDate: Date | null
  supplierPaymentTermsDays: number | null
}): Date | null {
  if (input.extractedDueDate) return input.extractedDueDate
  if (input.documentDate && input.supplierPaymentTermsDays !== null && input.supplierPaymentTermsDays >= 0) {
    const inferred = new Date(input.documentDate)
    inferred.setDate(inferred.getDate() + input.supplierPaymentTermsDays)
    return inferred
  }
  return null
}

/** Aging bucket a due-date falls into as of `asOf`. `current` covers on-or-before-today-and-due;
 * negative days-past-due are treated as "not yet due" (current). */
export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+"

export function agingBucket(dueDate: Date | null, asOf: Date): AgingBucket | null {
  if (!dueDate) return null
  const dueMs = dueDate.getTime()
  const nowMs = asOf.getTime()
  const daysPastDue = Math.floor((nowMs - dueMs) / (1000 * 60 * 60 * 24))
  if (daysPastDue <= 0) return "current"
  if (daysPastDue <= 30) return "1-30"
  if (daysPastDue <= 60) return "31-60"
  if (daysPastDue <= 90) return "61-90"
  return "90+"
}

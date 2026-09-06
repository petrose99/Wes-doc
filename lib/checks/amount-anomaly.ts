/** A2.7: two cheap statistical anomaly checks per supplier — a round-number spike (an invoice
 * where the total is a suspiciously round figure vs a supplier's history of specific amounts)
 * and a z-score outlier (a total > 2.5σ from this supplier's rolling mean). Both warn, never
 * fail: an unusually large one-off IS possible and legitimate; it's a "look at it" signal, not
 * a block. Pure — the caller resolves the supplier's history and passes it in as a plain array
 * of previous totals. */
import type { CheckResult } from "@/lib/checks/types"

/** Minimum history before either signal is trusted. Below this a supplier's mean is dominated
 * by whatever the first document happened to be, so anomaly reports would be almost pure noise. */
export const AMOUNT_ANOMALY_MIN_HISTORY = 10
export const AMOUNT_ZSCORE_THRESHOLD = 2.5

function isSuspiciouslyRound(value: number): boolean {
  const absolute = Math.abs(value)
  if (absolute < 100) return false
  // "Round" = an even multiple of 100 with no cents AND at least three trailing zeros in
  // whole-dollar form ("$1,000", "$5,500", "$10,000"); a genuine invoice for $1,000.00 exact
  // is rarer than one for $1,047.28 by a wide margin in real vendor billing.
  if (Math.round(absolute * 100) % 100 !== 0) return false
  if (absolute % 100 !== 0) return false
  return absolute % 500 === 0 || /000$/.test(String(Math.round(absolute)))
}

export function checkAmountAnomaly(input: {
  amount: number | null
  history: number[]
  supplierName: string | null
}): CheckResult | null {
  if (input.amount === null || !Number.isFinite(input.amount)) return null
  const history = input.history.filter((amount) => Number.isFinite(amount) && amount !== 0)
  if (history.length < AMOUNT_ANOMALY_MIN_HISTORY) return null

  const mean = history.reduce((sum, amount) => sum + amount, 0) / history.length
  const variance = history.reduce((sum, amount) => sum + (amount - mean) ** 2, 0) / history.length
  const stdev = Math.sqrt(variance)

  const zscore = stdev > 0 ? (input.amount - mean) / stdev : 0
  const highZ = Math.abs(zscore) >= AMOUNT_ZSCORE_THRESHOLD
  // Round-number spike only fires when the amount is BOTH round AND high-z: a supplier who
  // has always billed $1,000 doesn't get flagged on their eleventh $1,000 invoice.
  const roundSpike = isSuspiciouslyRound(input.amount) && highZ

  if (!highZ && !roundSpike) return null
  const supplier = input.supplierName ?? "this supplier"
  const message = roundSpike
    ? `Round-number amount (${input.amount}) is well above ${supplier}'s typical (mean ${mean.toFixed(2)}, σ ${stdev.toFixed(2)}).`
    : `Amount (${input.amount}) is ${Math.abs(zscore).toFixed(1)}σ from ${supplier}'s typical (mean ${mean.toFixed(2)}, σ ${stdev.toFixed(2)}).`
  return {
    checkCode: "amount_anomaly", status: "warn", message,
    detail: { amount: input.amount, mean, stdev, zscore, roundSpike, historyCount: history.length },
  }
}

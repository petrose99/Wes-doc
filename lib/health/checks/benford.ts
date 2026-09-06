/** A2.9: Benford's law check — the LEADING-digit distribution of naturally-occurring amounts
 * follows a specific log-scale curve. A significant chi-squared deviation from that curve
 * across a large batch of invoice totals is a classic fraud signal (fabricated amounts tend
 * to be uniformly-distributed or cluster on specific digits). Workspace-level only, never
 * per-document: Benford is meaningless below ~100 samples and can be legitimately violated
 * by a workspace whose real amounts are constrained (fixed-price service, quantized SKUs).
 * Pure logic; the registered health check pulls totals per GL account. */
import type { CheckDefinition, CheckRunResult } from "@/lib/health/types"

const BENFORD_EXPECTED = [0, 0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046]
export const BENFORD_MIN_SAMPLES = 100
/** χ² critical value at df=8 (nine buckets, one constraint), α=0.05 = 15.507. */
export const BENFORD_CHI_SQUARED_ALPHA_05 = 15.507

function leadingDigit(value: number): number {
  const absolute = Math.abs(value)
  if (!Number.isFinite(absolute) || absolute === 0) return 0
  let scaled = absolute
  while (scaled >= 10) scaled /= 10
  while (scaled < 1) scaled *= 10
  return Math.floor(scaled)
}

export function benfordChiSquared(values: number[]): { chiSquared: number; sample: number; observed: number[] } {
  const observed = Array.from({ length: 10 }, () => 0)
  for (const value of values) {
    const digit = leadingDigit(value)
    if (digit >= 1 && digit <= 9) observed[digit]++
  }
  const sample = observed.reduce((sum, count) => sum + count, 0)
  if (!sample) return { chiSquared: 0, sample: 0, observed }
  let chiSquared = 0
  for (let digit = 1; digit <= 9; digit++) {
    const expected = BENFORD_EXPECTED[digit] * sample
    if (expected > 0) chiSquared += ((observed[digit] - expected) ** 2) / expected
  }
  return { chiSquared, sample, observed }
}

export const benfordCheck: CheckDefinition = {
  code: "benford_leading_digits",
  name: "Leading-digit distribution (Benford's law)",
  category: "cleanup",
  defaultWeight: 1,
  requiresLedger: true,
  run: (ctx): CheckRunResult => {
    const transactions = ctx.ledger?.transactions ?? []
    const values = transactions
      .map((t) => (typeof t.amount === "number" ? Math.abs(t.amount) : 0))
      .filter((v) => Number.isFinite(v) && v > 0)
    if (values.length < BENFORD_MIN_SAMPLES) return { findings: [], applicableCount: values.length }
    const { chiSquared, sample, observed } = benfordChiSquared(values)
    if (chiSquared <= BENFORD_CHI_SQUARED_ALPHA_05) return { findings: [], applicableCount: sample }
    return {
      findings: [{
        checkCode: "benford_leading_digits",
        category: "cleanup",
        severity: "warning",
        title: `Amount leading-digit distribution deviates from Benford's law (χ² ${chiSquared.toFixed(2)} > ${BENFORD_CHI_SQUARED_ALPHA_05}, n=${sample})`,
        description: `Across ${sample} ledger amounts the leading-digit frequencies do not match the log-scale distribution real business amounts usually follow. Legitimate causes include a constrained price list, quantized SKUs, or a small number of large repeat suppliers. Worth an eyeball — it is not by itself proof of anything.`,
        externalTransactionId: null,
        suggestedAction: null,
        suggestedActionPayload: { observed, chiSquared, sample } as unknown as Record<string, unknown>,
        affectedCount: sample,
      }],
      applicableCount: sample,
    }
  },
}

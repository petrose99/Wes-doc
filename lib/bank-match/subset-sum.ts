/** Q3 A3.4: bounded subset-sum many-to-one bank matching. A single bank deposit is often the
 * NET of multiple invoices from one supplier — the deposit for $283.47 equals invoices 100 +
 * 78.50 + 105.03 minus a $0.06 fee. This finds a subset of candidates whose totals sum to a
 * target amount within tolerance. Branch-and-bound: worst case is 2^15 (arg cap) but real
 * inputs prune aggressively. Pure. */

export type SubsetCandidate = { documentId: string; amount: number }
export type SubsetSolution = { documentIds: string[]; total: number; residual: number }

const MAX_ITEMS = 15
const MIN_ITEMS = 2

/** Finds a single subset (the first one within tolerance) summing near `target`. Returns null
 * when none exists. Candidates are sorted descending so the largest amounts are considered
 * first — for typical settlement flows that converges fastest. */
export function findSubsetSum(candidates: SubsetCandidate[], target: number, tolerance: number): SubsetSolution | null {
  if (!Number.isFinite(target) || !candidates.length) return null
  const items = [...candidates].filter((c) => Number.isFinite(c.amount) && c.amount !== 0).slice(0, MAX_ITEMS).sort((a, b) => b.amount - a.amount)
  if (items.length < MIN_ITEMS) return null

  // Suffix sums for pruning: at index i, sum of items[i..] — if the current chosen sum plus
  // that suffix sum can't reach target - tolerance, backtrack immediately.
  const suffix = new Array(items.length + 1).fill(0)
  for (let i = items.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + Math.max(items[i].amount, 0)

  const chosen: number[] = []
  let best: SubsetSolution | null = null

  function recurse(index: number, sum: number): void {
    if (best) return
    if (chosen.length >= MIN_ITEMS && Math.abs(sum - target) <= tolerance) {
      best = { documentIds: chosen.map((i) => items[i].documentId), total: sum, residual: sum - target }
      return
    }
    if (index >= items.length) return
    if (sum + suffix[index] < target - tolerance) return
    if (sum > target + tolerance) return
    // Take
    chosen.push(index)
    recurse(index + 1, sum + items[index].amount)
    chosen.pop()
    if (best) return
    // Skip
    recurse(index + 1, sum)
  }

  recurse(0, 0)
  return best
}

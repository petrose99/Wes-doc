/** Bank recon: "asserted, soft delta" per decision #42. v1 has no bank-statement ingestion,
 * so the compute layer produces a shape marked awaiting-assertion. #97 will read this and
 * expose the assertion input; a follow-up ticket wires the DocuBite-side balance. */

import type { ComputedBankRecon } from "./types"

/** v1 tolerance for the soft delta check, in workspace base-currency units. */
export const BANK_RECON_DEFAULT_TOLERANCE = 1.0

export type ComputeBankReconInput = {
  /** Prior assertion carried over, if any — recompute preserves what the human typed on
   * the previous run so the assertion doesn't reset every re-open. */
  priorAssertion?: number | null
  /** Optional computed balance snapshot from an eventual ledger integration; v1 leaves it
   * null and the computer emits `awaiting-assertion` regardless. */
  computedBalance?: number | null
  tolerance?: number
}

export function computeBankRecon(input: ComputeBankReconInput = {}): ComputedBankRecon {
  const tolerance = input.tolerance ?? BANK_RECON_DEFAULT_TOLERANCE
  const assertedBalance = input.priorAssertion ?? null
  const computedBalance = input.computedBalance ?? null

  let status: ComputedBankRecon["status"] = "awaiting-assertion"
  let deltaAmount: number | null = null
  if (assertedBalance !== null && computedBalance !== null) {
    deltaAmount = round2(assertedBalance - computedBalance)
    status = Math.abs(deltaAmount) <= tolerance ? "within-tolerance" : "delta-flagged"
  }

  return {
    kind: "bank-recon",
    status,
    assertedBalance,
    computedBalance,
    deltaAmount,
    tolerance,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

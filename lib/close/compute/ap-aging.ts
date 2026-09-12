/** AP aging + open-exception listing (#96, decision #42). Buckets unpaid bills by days-past-
 * due relative to period end; open exceptions surface every open Gate row on workspace docs
 * (hard-blocking count is the lock-guard predicate). */

import type { CloseCandidateBill } from "./bills"
import type { ComputedApAging } from "./types"

export type ComputeApAgingInput = {
  periodEnd: Date
  bills: readonly CloseCandidateBill[]
  /** Passed straight through into the payload — comes from a single gate query at the top of
   * the compute pass so aging + accruals reuse it. */
  openGates: readonly { id: string; severity: string }[]
}

/** Max ids surfaced in the payload for hyperlinking. The count is authoritative; ids are a
 * hint for the UI. */
const MAX_GATE_IDS = 50

export function computeApAging(input: ComputeApAgingInput): ComputedApAging {
  const aging = {
    currentAmount: 0,
    currentCount: 0,
    days_1_30_amount: 0,
    days_1_30_count: 0,
    days_31_60_amount: 0,
    days_31_60_count: 0,
    days_61_90_amount: 0,
    days_61_90_count: 0,
    days_90_plus_amount: 0,
    days_90_plus_count: 0,
  }

  let totalOpenAmount = 0
  let totalOpenCount = 0

  const periodEndMs = input.periodEnd.getTime()
  for (const c of input.bills) {
    // v1 aging uses gross in the bill's own currency. Mixed-currency workspaces get a
    // flagged follow-up (see the ComputedValue type doc); no FX conversion here.
    const gross = c.bill.gross
    // A bill without a due date is treated as "current" (not yet overdue). This mirrors the
    // AP practice of not aging a bill until we've committed to a payment date.
    const dueTime = c.dueDate ? c.dueDate.getTime() : periodEndMs + 1
    const daysOverdue = Math.floor((periodEndMs - dueTime) / (24 * 60 * 60 * 1000))

    totalOpenAmount += gross
    totalOpenCount += 1

    if (daysOverdue <= 0) {
      aging.currentAmount += gross
      aging.currentCount += 1
    } else if (daysOverdue <= 30) {
      aging.days_1_30_amount += gross
      aging.days_1_30_count += 1
    } else if (daysOverdue <= 60) {
      aging.days_31_60_amount += gross
      aging.days_31_60_count += 1
    } else if (daysOverdue <= 90) {
      aging.days_61_90_amount += gross
      aging.days_61_90_count += 1
    } else {
      aging.days_90_plus_amount += gross
      aging.days_90_plus_count += 1
    }
  }

  let hardBlockingCount = 0
  let softCount = 0
  const gateIds: string[] = []
  for (const g of input.openGates) {
    if (g.severity === "hard") hardBlockingCount += 1
    else softCount += 1
    if (gateIds.length < MAX_GATE_IDS) gateIds.push(g.id)
  }

  return {
    kind: "ap-aging",
    aging: {
      currentAmount: round2(aging.currentAmount),
      currentCount: aging.currentCount,
      days_1_30_amount: round2(aging.days_1_30_amount),
      days_1_30_count: aging.days_1_30_count,
      days_31_60_amount: round2(aging.days_31_60_amount),
      days_31_60_count: aging.days_31_60_count,
      days_61_90_amount: round2(aging.days_61_90_amount),
      days_61_90_count: aging.days_61_90_count,
      days_90_plus_amount: round2(aging.days_90_plus_amount),
      days_90_plus_count: aging.days_90_plus_count,
    },
    totalOpenAmount: round2(totalOpenAmount),
    totalOpenCount,
    openExceptions: {
      hardBlockingCount,
      softCount,
      gateIds,
    },
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

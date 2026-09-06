/** Q3 A3.5: PSP payout decomposition. Stripe/PayPal settle a batch of daily transactions as
 * one net deposit: gross(charges) - refunds - fees = deposit. This module takes a parsed
 * payout report (a list of components) and DECOMPOSES the net deposit into its constituents
 * so each can be matched to its originating invoice/document via the same bank-matcher path.
 * Pure. */

export type PayoutComponent = {
  externalId: string
  kind: "charge" | "refund" | "fee" | "adjustment"
  gross: number
  fee: number
  net: number
  currencyCode: string | null
  reference: string | null
}

export type PayoutDecomposition = {
  payoutId: string
  currencyCode: string | null
  expectedNet: number
  computedNet: number
  balanced: boolean
  charges: PayoutComponent[]
  refunds: PayoutComponent[]
  fees: PayoutComponent[]
}

const TOLERANCE = 0.005

export function decomposePayout(input: { payoutId: string; currencyCode: string | null; expectedNet: number; components: PayoutComponent[] }): PayoutDecomposition {
  const charges = input.components.filter((c) => c.kind === "charge")
  const refunds = input.components.filter((c) => c.kind === "refund")
  const fees = input.components.filter((c) => c.kind === "fee" || c.kind === "adjustment")
  const computedNet = input.components.reduce((sum, c) => sum + c.net, 0)
  return {
    payoutId: input.payoutId,
    currencyCode: input.currencyCode,
    expectedNet: input.expectedNet,
    computedNet,
    balanced: Math.abs(computedNet - input.expectedNet) <= TOLERANCE,
    charges, refunds, fees,
  }
}

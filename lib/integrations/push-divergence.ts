/** Q3 A7.6: post-push divergence monitor. After we push a bill to the provider, a person can
 * edit that bill at the provider (change the amount, void it, re-code it). This detects the
 * mismatch: compare the provider's current record against the snapshot we sent, per-field.
 * The provider-side webhook/CDC and the diff-render are the infra; this is the pure diff
 * function they call. */

export type LedgerBillSnapshot = {
  externalBillId: string
  vendor: string | null
  total: number | null
  currencyCode: string | null
  status: "open" | "paid" | "voided" | null
  memo: string | null
}

export type BillDivergence = {
  field: keyof LedgerBillSnapshot
  ours: unknown
  provider: unknown
}

export function diffBillSnapshot(ours: LedgerBillSnapshot, provider: LedgerBillSnapshot): BillDivergence[] {
  if (ours.externalBillId !== provider.externalBillId) return [{ field: "externalBillId", ours: ours.externalBillId, provider: provider.externalBillId }]
  const out: BillDivergence[] = []
  const scalarKeys: (keyof LedgerBillSnapshot)[] = ["vendor", "currencyCode", "status", "memo"]
  for (const key of scalarKeys) {
    if ((ours[key] ?? null) !== (provider[key] ?? null)) out.push({ field: key, ours: ours[key], provider: provider[key] })
  }
  if (ours.total !== null && provider.total !== null && Math.abs(ours.total - provider.total) > 0.005) {
    out.push({ field: "total", ours: ours.total, provider: provider.total })
  }
  return out
}

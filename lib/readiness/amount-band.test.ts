import { describe, expect, it } from "vitest"
import { bandFor, parseBands, type AmountBand } from "@/lib/readiness/amount-band"

const bands: AmountBand[] = [
  { min: 0, max: 100, minConfidence: 0.75 },
  { min: 0, max: 500, minConfidence: 0.85, requireVerifiedSupplier: true },
]

describe("bandFor", () => {
  it("falls back to workspace floor when amount is null or no bands", () => {
    expect(bandFor({ amount: null, supplierVerified: true, workspaceMinConfidence: 0.9, bands }).minConfidence).toBe(0.9)
    expect(bandFor({ amount: 50, supplierVerified: true, workspaceMinConfidence: 0.9, bands: [] }).minConfidence).toBe(0.9)
  })

  it("relaxes to the loosest matching band's floor", () => {
    // $50 matches both bands; the small-doc 0.75 wins.
    expect(bandFor({ amount: 50, supplierVerified: true, workspaceMinConfidence: 0.9, bands }).minConfidence).toBe(0.75)
  })

  it("skips verified-supplier bands for unverified suppliers", () => {
    expect(bandFor({ amount: 300, supplierVerified: false, workspaceMinConfidence: 0.9, bands }).minConfidence).toBe(0.9)
    expect(bandFor({ amount: 300, supplierVerified: true, workspaceMinConfidence: 0.9, bands }).minConfidence).toBe(0.85)
  })

  it("never tightens beyond the workspace floor — bands only relax", () => {
    const tighter: AmountBand[] = [{ min: 0, max: 100, minConfidence: 0.99 }]
    expect(bandFor({ amount: 50, supplierVerified: true, workspaceMinConfidence: 0.85, bands: tighter }).minConfidence).toBe(0.85)
  })

  it("uses the absolute value so a credit note still lands in its band", () => {
    expect(bandFor({ amount: -75, supplierVerified: true, workspaceMinConfidence: 0.9, bands }).minConfidence).toBe(0.75)
  })
})

describe("parseBands", () => {
  it("drops malformed entries silently", () => {
    expect(parseBands([{ min: 0, max: 10, minConfidence: 0.8 }, { junk: true }, null])).toHaveLength(1)
  })
  it("rejects out-of-range confidences", () => {
    expect(parseBands([{ min: 0, max: 10, minConfidence: 1.5 }])).toHaveLength(0)
  })
  it("accepts null bounds as unbounded", () => {
    const parsed = parseBands([{ min: null, max: null, minConfidence: 0.85 }])
    expect(parsed[0]).toMatchObject({ min: null, max: null })
  })
})

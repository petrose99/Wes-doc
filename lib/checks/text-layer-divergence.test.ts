import { describe, expect, it } from "vitest"
import { checkTextLayerDivergence } from "@/lib/checks/text-layer-divergence"

describe("checkTextLayerDivergence", () => {
  it("silent when either side is empty", () => {
    expect(checkTextLayerDivergence({ textLayer: null, ocrText: "Total 100.00" })).toBeNull()
    expect(checkTextLayerDivergence({ textLayer: "", ocrText: "Total 100.00" })).toBeNull()
  })

  it("silent when there aren't enough money tokens to be conclusive", () => {
    expect(checkTextLayerDivergence({ textLayer: "Total $100.00", ocrText: "TOTAL 100" })).toBeNull()
  })

  it("passes silently when the money tokens agree", () => {
    const text = "Subtotal $87.50 Tax $12.50 Total $100.00 Balance $100.00"
    expect(checkTextLayerDivergence({ textLayer: text, ocrText: text })).toBeNull()
  })

  it("warns when the two sides disagree on the totals", () => {
    const layer = "Subtotal $87.50 Tax $12.50 Total $100.00 Balance $100.00"
    const ocr = "Subtotal $87.50 Tax $12.50 Total $999.00 Balance $999.00"
    const result = checkTextLayerDivergence({ textLayer: layer, ocrText: ocr })
    expect(result?.status).toBe("warn")
    expect(result?.detail?.jaccard).toBeLessThan(0.7)
  })
})

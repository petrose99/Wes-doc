import { describe, expect, it } from "vitest"
import type { DocumentFieldDefinition } from "@/lib/document-templates"
import { AGREEMENT_CONFIDENCE, buildVerificationPrompt, reconcileVerification } from "./verify"

const FIELDS: DocumentFieldDefinition[] = [
  { key: "subtotal", label: "Subtotal", type: "number", instruction: "", required: false },
  { key: "total", label: "Total", type: "number", instruction: "", required: true },
]

describe("buildVerificationPrompt", () => {
  it("names each suspect field with its first-pass value", () => {
    const prompt = buildVerificationPrompt("Invoice", FIELDS, { subtotal: 5964.5, total: 6610.95 })
    expect(prompt).toContain("subtotal (number): first pass extracted 5964.5")
    expect(prompt).toContain("total (number): first pass extracted 6610.95")
  })

  it("shows null for a field the first pass could not read", () => {
    const prompt = buildVerificationPrompt("Invoice", FIELDS, { total: 100 })
    expect(prompt).toContain("subtotal (number): first pass extracted null")
  })

  it("warns about the common digit misreads", () => {
    const prompt = buildVerificationPrompt("Invoice", FIELDS, {})
    expect(prompt).toContain("transposed digits")
  })
})

describe("reconcileVerification", () => {
  it("floors agreement at AGREEMENT_CONFIDENCE when both passes read the same value", () => {
    const result = reconcileVerification(FIELDS, { subtotal: 100, total: 120 }, { subtotal: 100, total: 120 }, { subtotal: 0.6, total: 0.95 })
    expect(result.changed).toEqual([])
    expect(result.confidence.subtotal).toBe(AGREEMENT_CONFIDENCE)
    expect(result.confidence.total).toBe(0.95)
  })

  it("takes the corrected value and reports it as changed", () => {
    const result = reconcileVerification(FIELDS, { subtotal: 108, total: 120 }, { subtotal: 100, total: 120 }, { subtotal: 0.92 })
    expect(result.values.subtotal).toBe(100)
    expect(result.changed).toEqual(["subtotal"])
    expect(result.confidence.subtotal).toBe(0.92)
  })

  it("defaults a correction's confidence when the pass did not score it", () => {
    const result = reconcileVerification(FIELDS, { subtotal: 108 }, { subtotal: 100 }, {})
    expect(result.confidence.subtotal).toBe(0.85)
  })

  it("skips fields the verification pass did not return", () => {
    const result = reconcileVerification(FIELDS, { subtotal: 108, total: 120 }, { total: 120 }, {})
    expect(result.values.subtotal).toBeUndefined()
    expect(result.values.total).toBe(120)
  })
})

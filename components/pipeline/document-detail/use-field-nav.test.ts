import { describe, expect, it } from "vitest"
import { orderSuspectFields, NAV_SUSPECT_THRESHOLD } from "@/components/pipeline/document-detail/use-field-nav"

describe("orderSuspectFields", () => {
  const s = (key: string, confidence: number | null, type = "string") => ({ key, confidence, type })

  it("keeps only fields below the suspect threshold, non-array", () => {
    const order = orderSuspectFields([
      s("high", 0.95),
      s("low", 0.3),
      s("mid", 0.5),
      s("array", 0.1, "array"),
      s("null", null),
    ])
    expect(order).toEqual(["low", "mid"])
  })

  it("orders lowest-confidence first (most-suspect field wins)", () => {
    const order = orderSuspectFields([s("a", 0.55), s("b", 0.15), s("c", 0.45)])
    expect(order).toEqual(["b", "c", "a"])
  })

  it("breaks ties by the field's own position — stable across renders", () => {
    const order = orderSuspectFields([s("first", 0.3), s("second", 0.3), s("third", 0.3)])
    expect(order).toEqual(["first", "second", "third"])
  })

  it("returns [] when nothing is suspect", () => {
    expect(orderSuspectFields([s("a", 0.99), s("b", 0.9)])).toEqual([])
  })

  it("threshold matches the amber-row rule so amber === visited-by-nav", () => {
    // If this ever changes, field-row.tsx's LOW_CONFIDENCE must move in lockstep.
    expect(NAV_SUSPECT_THRESHOLD).toBe(0.6)
  })
})

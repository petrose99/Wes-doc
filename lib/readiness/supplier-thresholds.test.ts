import { describe, expect, it } from "vitest"
import {
  shouldSampleForQa,
  supplierThreshold,
  SUPPLIER_COLD_START_COUNT,
  SUPPLIER_COLD_THRESHOLD,
  SUPPLIER_TRUST_FLOOR,
  SUPPLIER_TRUST_STREAK,
} from "@/lib/readiness/supplier-thresholds"

describe("supplierThreshold", () => {
  it("holds at the strict cold threshold when the streak is short", () => {
    const v = supplierThreshold({ workspaceMinConfidence: 0.85, touchlessSeen: 5, consecutiveClean: 0 })
    expect(v.effectiveMinConfidence).toBe(SUPPLIER_COLD_THRESHOLD)
  })

  it("steps down to the workspace floor once the streak crosses the trust threshold", () => {
    const v = supplierThreshold({ workspaceMinConfidence: 0.85, touchlessSeen: 100, consecutiveClean: SUPPLIER_TRUST_STREAK })
    expect(v.effectiveMinConfidence).toBe(SUPPLIER_TRUST_FLOOR)
  })

  it("never goes below the safety floor even if the workspace picked something laxer", () => {
    const v = supplierThreshold({ workspaceMinConfidence: 0.5, touchlessSeen: 100, consecutiveClean: SUPPLIER_TRUST_STREAK })
    expect(v.effectiveMinConfidence).toBe(SUPPLIER_TRUST_FLOOR)
  })

  it("honors a workspace floor stricter than the safety floor", () => {
    const v = supplierThreshold({ workspaceMinConfidence: 0.95, touchlessSeen: 100, consecutiveClean: SUPPLIER_TRUST_STREAK })
    expect(v.effectiveMinConfidence).toBe(0.95)
  })

  it("cold-start applies while the supplier hasn't been through enough documents yet", () => {
    for (let seen = 0; seen < SUPPLIER_COLD_START_COUNT; seen++) {
      expect(supplierThreshold({ workspaceMinConfidence: 0.85, touchlessSeen: seen, consecutiveClean: 20 }).coldStart).toBe(true)
    }
    expect(supplierThreshold({ workspaceMinConfidence: 0.85, touchlessSeen: SUPPLIER_COLD_START_COUNT, consecutiveClean: 20 }).coldStart).toBe(false)
  })

  it("treats null stats (unresolved supplier) as new", () => {
    const v = supplierThreshold({ workspaceMinConfidence: 0.85, touchlessSeen: null, consecutiveClean: null })
    expect(v.coldStart).toBe(true)
    expect(v.effectiveMinConfidence).toBe(SUPPLIER_COLD_THRESHOLD)
  })
})

describe("shouldSampleForQa", () => {
  it("returns false for rate 0 or negative", () => {
    expect(shouldSampleForQa("doc-1", 0)).toBe(false)
    expect(shouldSampleForQa("doc-1", -1)).toBe(false)
  })

  it("returns true for rate >= 1", () => {
    expect(shouldSampleForQa("doc-1", 1)).toBe(true)
  })

  it("is deterministic for the same (documentId, rate)", () => {
    expect(shouldSampleForQa("doc-abc", 0.5)).toBe(shouldSampleForQa("doc-abc", 0.5))
  })

  it("approaches the target rate over many document ids", () => {
    const rate = 0.1
    let sampled = 0
    const trials = 5000
    for (let i = 0; i < trials; i++) if (shouldSampleForQa(`doc-${i}`, rate)) sampled++
    const observed = sampled / trials
    expect(Math.abs(observed - rate)).toBeLessThan(0.02)
  })
})

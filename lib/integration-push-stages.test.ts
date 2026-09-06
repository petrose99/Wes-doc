import { describe, expect, it } from "vitest"
import { canTransition, isStageComplete } from "@/lib/integration-push-stages"

describe("canTransition", () => {
  it("moves forward through the pipeline", () => {
    expect(canTransition("pending", "vendor_resolved")).toBe(true)
    expect(canTransition("vendor_resolved", "bill_created")).toBe(true)
    expect(canTransition("bill_created", "confirmed")).toBe(true)
  })
  it("failed is reachable from any mid-flight stage but never leaves", () => {
    expect(canTransition("pending", "failed")).toBe(true)
    expect(canTransition("bill_created", "failed")).toBe(true)
    expect(canTransition("failed", "pending")).toBe(false)
    expect(canTransition("failed", "failed")).toBe(true)
  })
  it("cannot roll back", () => {
    expect(canTransition("bill_created", "vendor_resolved")).toBe(false)
  })
})

describe("isStageComplete", () => {
  it("returns true once the current stage has surpassed the target step", () => {
    expect(isStageComplete("vendor_resolved", "vendor_resolved")).toBe(true)
    expect(isStageComplete("bill_created", "vendor_resolved")).toBe(true)
    expect(isStageComplete("pending", "vendor_resolved")).toBe(false)
  })
})

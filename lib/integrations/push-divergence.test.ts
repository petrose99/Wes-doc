import { describe, expect, it } from "vitest"
import { diffBillSnapshot } from "@/lib/integrations/push-divergence"

const snap = (o: Partial<Parameters<typeof diffBillSnapshot>[0]> = {}) => ({
  externalBillId: "bill_1", vendor: "Acme", total: 100, currencyCode: "USD", status: "open" as const, memo: null,
  ...o,
})

describe("diffBillSnapshot", () => {
  it("returns [] when nothing changed", () => {
    expect(diffBillSnapshot(snap(), snap())).toEqual([])
  })
  it("flags a total change", () => {
    expect(diffBillSnapshot(snap(), snap({ total: 200 }))).toEqual([{ field: "total", ours: 100, provider: 200 }])
  })
  it("flags a status flip to voided", () => {
    expect(diffBillSnapshot(snap(), snap({ status: "voided" }))).toEqual([{ field: "status", ours: "open", provider: "voided" }])
  })
  it("short-circuits when the external ids don't match", () => {
    const d = diffBillSnapshot(snap(), snap({ externalBillId: "bill_2", total: 200 }))
    expect(d).toHaveLength(1)
    expect(d[0].field).toBe("externalBillId")
  })
})

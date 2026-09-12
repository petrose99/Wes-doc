import { describe, expect, it } from "vitest"
import { descriptorsForClose } from "./item-sets"

describe("descriptorsForClose", () => {
  it("returns the three common items when no pack and no VAT — the null-jurisdiction baseline", () => {
    const items = descriptorsForClose(null, false)
    expect(items.map((i) => i.kind)).toEqual(["bank-recon", "ap-aging", "unposted-bill-accruals"])
  })

  it("appends the VAT workpaper on a VAT-period-end", () => {
    const items = descriptorsForClose("ZA", true)
    expect(items.map((i) => i.kind)).toContain("vat-workpaper")
    // Order: common → VAT → jurisdiction extras. ZA has no extras, so VAT is last.
    expect(items[items.length - 1].kind).toBe("vat-workpaper")
  })

  it("LS adds a cross-border review row (SARS-RSL common-border arrangement)", () => {
    const items = descriptorsForClose("LS", true)
    const kinds = items.map((i) => i.kind)
    expect(kinds).toContain("cross-border-review")
    expect(kinds).toContain("vat-workpaper")
  })

  it("ZA gets no cross-border row — that arrangement's buyer-side is LS only", () => {
    const items = descriptorsForClose("ZA", true)
    expect(items.map((i) => i.kind)).not.toContain("cross-border-review")
  })

  it("bank recon is the only item flagged softDelta — asserted-with-tolerance per #42", () => {
    const items = descriptorsForClose("ZA", true)
    const soft = items.filter((i) => i.softDelta).map((i) => i.kind)
    expect(soft).toEqual(["bank-recon"])
  })

  it("omits the VAT workpaper when the month is not a VAT-period-end", () => {
    const items = descriptorsForClose("ZA", false)
    expect(items.map((i) => i.kind)).not.toContain("vat-workpaper")
  })
})

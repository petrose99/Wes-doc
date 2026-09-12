import { describe, expect, test } from "vitest"
import { categoryNatureLookup, type CategoryNatureRow } from "./category-natures"

describe("categoryNatureLookup", () => {
  test("returns nature for a category that has a row", () => {
    const rows: CategoryNatureRow[] = [
      { id: "1", category: "software", nature: "services" },
      { id: "2", category: "office_supplies", nature: "goods" },
    ]
    const lookup = categoryNatureLookup(rows)
    expect(lookup("software")).toBe("services")
    expect(lookup("office_supplies")).toBe("goods")
  })

  test("returns null for an unmapped category (silent-pass contract)", () => {
    const lookup = categoryNatureLookup([{ id: "1", category: "software", nature: "services" }])
    expect(lookup("marketing")).toBeNull()
    expect(lookup("")).toBeNull()
  })

  test("returns null when the dictionary is empty", () => {
    const lookup = categoryNatureLookup([])
    expect(lookup("anything")).toBeNull()
  })

  test("is case-sensitive on the category key (matches CategoryAccountMapping convention)", () => {
    const lookup = categoryNatureLookup([{ id: "1", category: "software", nature: "services" }])
    expect(lookup("Software")).toBeNull()
    expect(lookup("SOFTWARE")).toBeNull()
  })
})

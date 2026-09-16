import { describe, expect, it } from "vitest"
import { activeFilterCount, clearFilterParams, facetOptionValues, facetSelectedValues } from "@/lib/queue/filters"

const STATUS = { param: "status", options: [{ value: "not_eligible" }] }
const APPROVER = { param: "approver", options: [{ value: "anyone" }] }
const SECTIONED = { param: "kind", sections: [{ options: [{ value: "a" }, { value: "b" }] }, { options: [{ value: "c" }] }] }
const SORT = { param: "sort", defaultKey: "waiting" }

describe("facetOptionValues", () => {
  it("flattens sectioned facets and reads flat ones", () => {
    expect(facetOptionValues(SECTIONED)).toEqual(["a", "b", "c"])
    expect(facetOptionValues(STATUS)).toEqual(["not_eligible"])
  })
})

describe("facetSelectedValues", () => {
  it("reads comma-separated values and drops ones outside the option set", () => {
    expect(facetSelectedValues(SECTIONED, new URLSearchParams("kind=a,zzz,c"))).toEqual(["a", "c"])
    expect(facetSelectedValues(STATUS, new URLSearchParams())).toEqual([])
  })
})

describe("activeFilterCount (#257 spec 3.3 — the 'Filter · 2' label)", () => {
  it("is zero on a bare URL", () => {
    expect(activeFilterCount(new URLSearchParams(), [STATUS, APPROVER], SORT)).toBe(0)
  })

  it("counts each facet with a valid value once", () => {
    expect(activeFilterCount(new URLSearchParams("status=not_eligible&approver=anyone"), [STATUS, APPROVER], SORT)).toBe(2)
  })

  it("counts a non-default sort as one filter, not a default sort spelled out", () => {
    expect(activeFilterCount(new URLSearchParams("sort=due"), [STATUS, APPROVER], SORT)).toBe(1)
    expect(activeFilterCount(new URLSearchParams("sort=waiting"), [STATUS, APPROVER], SORT)).toBe(0)
    expect(activeFilterCount(new URLSearchParams("sort="), [STATUS, APPROVER], SORT)).toBe(0)
  })

  it("ignores a facet value that is not one of its options", () => {
    expect(activeFilterCount(new URLSearchParams("status=bogus"), [STATUS], SORT)).toBe(0)
  })
})

describe("clearFilterParams (#261 — the one Clear filters)", () => {
  it("strips every facet param and the sort param, keeping view and from", () => {
    const next = clearFilterParams(new URLSearchParams("status=not_eligible&approver=anyone&sort=due&view=v1&from=%2Fx"), [STATUS, APPROVER], "sort")
    expect(next.toString()).toBe("view=v1&from=%2Fx")
  })

  it("does not mutate the input and is a no-op on a bare URL", () => {
    const input = new URLSearchParams("status=not_eligible")
    const next = clearFilterParams(input, [STATUS], "sort")
    expect(input.toString()).toBe("status=not_eligible")
    expect(next.toString()).toBe("")
    expect(clearFilterParams(new URLSearchParams(), [STATUS], "sort").toString()).toBe("")
  })
})

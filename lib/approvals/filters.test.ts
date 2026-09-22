import { describe, expect, it } from "vitest"
import { countWaitingOnOthers, filterApprovalRows, searchParamsOf } from "@/lib/approvals/filters"

const ready = { status: "ready" } as const
const blocked = { status: "not_eligible", reason: "a check failed" } as const

const ROWS = [
  { id: "mine-ready", canDecide: true, eligibility: ready },
  { id: "mine-blocked", canDecide: true, eligibility: blocked },
  { id: "theirs-ready", canDecide: false, eligibility: ready },
  { id: "theirs-blocked", canDecide: false, eligibility: blocked },
]
const ids = (rows: typeof ROWS) => rows.map((row) => row.id)

describe("filterApprovalRows (#257 spec 3.4 — one predicate for page, list, sheet and empty state)", () => {
  it("defaults to the signed-in approver's rows, ineligible ones included", () => {
    expect(ids(filterApprovalRows(ROWS, new URLSearchParams()))).toEqual(["mine-ready", "mine-blocked"])
  })

  it("approver=anyone widens to every pending row", () => {
    expect(ids(filterApprovalRows(ROWS, new URLSearchParams("approver=anyone")))).toEqual(ids(ROWS))
  })

  it("status=not_eligible keeps only blocked rows, still within the approver scope", () => {
    expect(ids(filterApprovalRows(ROWS, new URLSearchParams("status=not_eligible")))).toEqual(["mine-blocked"])
    expect(ids(filterApprovalRows(ROWS, new URLSearchParams("status=not_eligible&approver=anyone")))).toEqual(["mine-blocked", "theirs-blocked"])
  })

  it("ignores unknown values", () => {
    expect(ids(filterApprovalRows(ROWS, new URLSearchParams("status=whatever&approver=me")))).toEqual(["mine-ready", "mine-blocked"])
  })
})

describe("countWaitingOnOthers", () => {
  it("counts the rows the actor cannot decide — the empty state's link", () => {
    expect(countWaitingOnOthers(ROWS)).toBe(2)
    expect(countWaitingOnOthers([])).toBe(0)
  })
})

describe("searchParamsOf", () => {
  it("drops undefined page params and keeps the rest", () => {
    const params = searchParamsOf({ status: "not_eligible", approver: undefined, sort: "due" })
    expect(params.toString()).toBe("status=not_eligible&sort=due")
  })
})

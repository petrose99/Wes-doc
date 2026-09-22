import { describe, expect, it } from "vitest"
import { DEFAULT_REVIEW_SLA_HOURS, resolveCountdown, resolveReviewSlaCountdown } from "@/lib/documents/countdown"

describe("resolveCountdown", () => {
  const asOf = new Date("2026-09-15T00:00:00Z")

  it("returns null when there's no deadline", () => {
    expect(resolveCountdown(null, asOf)).toBeNull()
  })

  it("is 'upcoming' (blue) well before the deadline, worded 'N Days Away'", () => {
    const result = resolveCountdown(new Date("2026-09-27T00:00:00Z"), asOf)
    expect(result).toEqual({ urgency: "upcoming", days: 12, label: "12 Days Away" })
  })

  it("singularizes 'Day' for exactly one day away", () => {
    const result = resolveCountdown(new Date("2026-09-20T00:00:00Z"), asOf, 0)
    expect(result).toEqual({ urgency: "upcoming", days: 5, label: "5 Days Away" })
  })

  it("is 'expiring' (purple) inside the warning window, worded 'Expires in N Days'", () => {
    const result = resolveCountdown(new Date("2026-09-17T00:00:00Z"), asOf, 3)
    expect(result).toEqual({ urgency: "expiring", days: 2, label: "Expires in 2 Days" })
  })

  it("says 'Expires Today' rather than 'Expires in 0 Days'", () => {
    const result = resolveCountdown(new Date("2026-09-15T00:00:00Z"), asOf, 3)
    expect(result).toEqual({ urgency: "expiring", days: 0, label: "Expires Today" })
  })

  it("is 'overdue' (red) once the deadline has passed, worded 'N Days Overdue'", () => {
    const result = resolveCountdown(new Date("2026-09-12T00:00:00Z"), asOf, 3)
    expect(result).toEqual({ urgency: "overdue", days: 3, label: "3 Days Overdue" })
  })

  it("singularizes 'Day' for exactly one day overdue", () => {
    const result = resolveCountdown(new Date("2026-09-14T00:00:00Z"), asOf, 3)
    expect(result).toEqual({ urgency: "overdue", days: 1, label: "1 Day Overdue" })
  })
})

describe("resolveReviewSlaCountdown", () => {
  it("returns null when there's no open review task", () => {
    expect(resolveReviewSlaCountdown(null, new Date(), DEFAULT_REVIEW_SLA_HOURS)).toBeNull()
  })

  it("times the SLA clock from when the review task opened, not from now", () => {
    const openedAt = new Date("2026-09-13T00:00:00Z")
    const asOf = new Date("2026-09-15T00:00:00Z") // 48h later — exactly at the default SLA
    const result = resolveReviewSlaCountdown(openedAt, asOf, DEFAULT_REVIEW_SLA_HOURS, 1)
    expect(result?.urgency).toBe("expiring")
    expect(result?.label).toBe("Expires Today")
  })

  it("goes overdue once the SLA budget has fully elapsed", () => {
    const openedAt = new Date("2026-09-10T00:00:00Z")
    const asOf = new Date("2026-09-15T00:00:00Z")
    const result = resolveReviewSlaCountdown(openedAt, asOf, DEFAULT_REVIEW_SLA_HOURS, 1)
    expect(result?.urgency).toBe("overdue")
  })
})

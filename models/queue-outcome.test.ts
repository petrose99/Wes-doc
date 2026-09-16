import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

import { startOfTodayIn } from "./queue-outcome"

describe("startOfTodayIn (#264 spec §2)", () => {
  it("is midnight of the current day in the given zone, as a UTC instant", () => {
    for (const tz of ["UTC", "Africa/Johannesburg", "America/Los_Angeles", "Asia/Kolkata"]) {
      const start = startOfTodayIn(tz)
      const local = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(start)
      const parts = Object.fromEntries(local.map((part) => [part.type, part.value]))
      expect(`${parts.hour % 24}:${parts.minute}:${parts.second}`, tz).toBe("0:00:00")
      expect(start.getTime()).toBeLessThanOrEqual(Date.now())
      expect(Date.now() - start.getTime()).toBeLessThan(24 * 60 * 60 * 1000)
    }
  })
})

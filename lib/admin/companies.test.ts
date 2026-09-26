import { describe, expect, it } from "vitest"
import { currencyLockEvent } from "./companies"

describe("currencyLockEvent", () => {
  it("names the bill, the provider and the day as '12 Sep 2026' whatever the ICU build", () => {
    expect(currencyLockEvent({ locked: true, cause: "bill", provider: "xero", at: "2026-09-12T09:00:00Z" }))
      .toBe("the first bill was posted to Xero on 12 Sep 2026")
  })

  it("names a payment batch without a provider", () => {
    expect(currencyLockEvent({ locked: true, cause: "payment_batch", provider: null, at: "2026-01-03T23:30:00Z" }))
      .toBe("the first payment batch was created on 3 Jan 2026")
  })
})

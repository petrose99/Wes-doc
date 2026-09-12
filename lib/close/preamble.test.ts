import { describe, expect, it } from "vitest"
import { buildClosePreamble, closePeriodLabel, type PreambleItem } from "./preamble"

const openClose = { periodYear: 2026, periodMonth: 3, state: "open" }

const item = (over: Partial<PreambleItem>): PreambleItem => ({
  kind: "ap-aging",
  title: "AP aging + open-exception review",
  state: "pending",
  reSignRequired: false,
  computedValue: null,
  ...over,
})

describe("closePeriodLabel", () => {
  it("names the month", () => {
    expect(closePeriodLabel(2026, 3)).toBe("March 2026")
    expect(closePeriodLabel(2026, 12)).toBe("December 2026")
  })
})

describe("buildClosePreamble", () => {
  it("summarizes every computed kind into one deterministic message", () => {
    const items: PreambleItem[] = [
      item({
        kind: "bank-recon", title: "Bank reconciliation",
        computedValue: { kind: "bank-recon", status: "awaiting-assertion", assertedBalance: null, computedBalance: null, deltaAmount: null, tolerance: 1 },
      }),
      item({
        computedValue: {
          kind: "ap-aging",
          aging: { currentAmount: 0, currentCount: 0, days_1_30_amount: 100, days_1_30_count: 2, days_31_60_amount: 0, days_31_60_count: 0, days_61_90_amount: 0, days_61_90_count: 0, days_90_plus_amount: 0, days_90_plus_count: 0 },
          totalOpenAmount: 100, totalOpenCount: 2,
          openExceptions: { hardBlockingCount: 1, softCount: 3, gateIds: ["g1"] },
        },
      }),
      item({
        kind: "unposted-bill-accruals", title: "Unposted-bill accruals",
        computedValue: {
          kind: "unposted-bill-accruals", periodEnd: "2026-03-31", reversalDate: "2026-04-01", vatSuspense: true,
          proposals: [
            { billId: "b1", invoiceDate: "2026-03-10", supplierName: "Acme", category: "Rent", debitNet: 100, debitVatSuspense: 15, creditAccruals: 115, gateStatus: "hard-blocking" },
            { billId: "b2", invoiceDate: "2026-03-11", supplierName: "Beta", category: "Fuel", debitNet: 50, debitVatSuspense: null, creditAccruals: 50, gateStatus: "clear" },
          ],
          totalNet: 150, totalVatSuspense: 15, totalAccruals: 165,
        },
      }),
      item({
        kind: "vat-workpaper", title: "VAT workpaper",
        computedValue: {
          kind: "vat-workpaper", packCode: "ZA", packVersion: "za-v1", groupId: null,
          sheets: [{ workpaperId: "vat201", label: "VAT201", totals: { output: 10 }, boxes: { "1": 10 }, billCount: 7 }],
        },
      }),
      item({
        kind: "cross-border-review", title: "RSA cross-border review",
        computedValue: {
          kind: "cross-border-review", windowDays: 30,
          bills: [{ billId: "b3", invoiceDate: "2026-03-05", supplierName: "SA Corp", grossAmount: 500, supplierVatNumber: null }],
          totalGross: 500,
        },
      }),
    ]

    const text = buildClosePreamble(openClose, items)
    expect(text).toContain("Your March 2026 close is open")
    expect(text).toContain("waiting for your asserted closing balance")
    expect(text).toContain("2 open bills totalling 100.00")
    expect(text).toContain("1 hard-blocking exception — these block the lock")
    expect(text).toContain("2 unposted bills propose accruals of 165.00 (reversing 2026-04-01)")
    expect(text).toContain("1 of them accrued despite an open hard gate")
    expect(text).toContain("VAT workpaper (ZA pack) computed VAT201 over 7 bills")
    expect(text).toContain("1 bill totalling 500.00 gross")
    expect(text).toContain("5 items still need sign-off")
    expect(text).toContain("working paper walkthrough, not advice")
    // Deterministic: two calls, same string.
    expect(buildClosePreamble(openClose, items)).toBe(text)
  })

  it("marks signed and overridden items, and flags re-sign after a reopen", () => {
    const items: PreambleItem[] = [
      item({
        state: "signed", reSignRequired: true,
        computedValue: {
          kind: "ap-aging",
          aging: { currentAmount: 0, currentCount: 0, days_1_30_amount: 0, days_1_30_count: 0, days_31_60_amount: 0, days_31_60_count: 0, days_61_90_amount: 0, days_61_90_count: 0, days_90_plus_amount: 0, days_90_plus_count: 0 },
          totalOpenAmount: 0, totalOpenCount: 0,
          openExceptions: { hardBlockingCount: 0, softCount: 0, gateIds: [] },
        },
      }),
      item({
        kind: "bank-recon", title: "Bank reconciliation", state: "override",
        computedValue: { kind: "bank-recon", status: "within-tolerance", assertedBalance: 50, computedBalance: null, deltaAmount: null, tolerance: 1 },
      }),
    ]
    const text = buildClosePreamble(openClose, items)
    expect(text).toContain("(signed) — re-sign required after the reopen")
    expect(text).toContain("(acknowledged via override)")
    expect(text).toContain("no open exceptions")
  })

  it("handles a locked close, an uncomputed item, and a packless VAT workpaper", () => {
    const text = buildClosePreamble({ ...openClose, state: "locked" }, [
      item({ computedValue: null, title: "AP aging + open-exception review" }),
      item({
        kind: "vat-workpaper", title: "VAT workpaper", state: "signed",
        computedValue: { kind: "vat-workpaper", packCode: null, packVersion: null, groupId: null, sheets: [] },
      }),
    ])
    expect(text).toContain("locked — everything below is the record as signed")
    expect(text).toContain("AP aging + open-exception review has not been computed yet")
    expect(text).toContain("no jurisdiction pack selected")
    expect(text).not.toContain("still need")
  })

  it("says everything is signed when nothing is pending on an open close", () => {
    const text = buildClosePreamble(openClose, [
      item({
        state: "signed",
        computedValue: {
          kind: "ap-aging",
          aging: { currentAmount: 0, currentCount: 0, days_1_30_amount: 0, days_1_30_count: 0, days_31_60_amount: 0, days_31_60_count: 0, days_61_90_amount: 0, days_61_90_count: 0, days_90_plus_amount: 0, days_90_plus_count: 0 },
          totalOpenAmount: 0, totalOpenCount: 0,
          openExceptions: { hardBlockingCount: 0, softCount: 0, gateIds: [] },
        },
      }),
    ])
    expect(text).toContain("Everything is signed — you can lock the period.")
  })
})

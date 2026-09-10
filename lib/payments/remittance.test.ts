import { describe, expect, it } from "vitest"
import { buildRemittanceAdvices } from "@/lib/payments/remittance"
import type { PaymentInstruction } from "@/lib/payments/za-eft-csv"

const ins = (over: Partial<PaymentInstruction>): PaymentInstruction => ({
  documentId: "d", supplier: "Acme Ltd", bankAccountNumber: "1", branchCode: "051001",
  amount: 100, currencyCode: "ZAR", reference: "INV-1", ...over,
})

describe("buildRemittanceAdvices", () => {
  it("groups multiple invoices for one supplier into a single advice", () => {
    const advices = buildRemittanceAdvices(
      [ins({ reference: "INV-1", amount: 100 }), ins({ reference: "INV-2", amount: 250 })],
      { name: "Test Co", runDate: new Date("2026-09-10T00:00:00Z") },
    )
    expect(advices).toHaveLength(1)
    expect(advices[0].totalAmount).toBe(350)
    expect(advices[0].invoices).toHaveLength(2)
    expect(advices[0].text).toMatch(/TOTAL\s+ZAR\s+350\.00/)
  })

  it("splits by currency so a mixed-currency supplier gets one advice per currency", () => {
    const advices = buildRemittanceAdvices(
      [ins({ reference: "INV-1", amount: 100, currencyCode: "ZAR" }), ins({ reference: "USD-1", amount: 50, currencyCode: "USD" })],
      { name: "Test Co", runDate: new Date() },
    )
    expect(advices).toHaveLength(2)
    expect(new Set(advices.map((a) => a.currencyCode))).toEqual(new Set(["ZAR", "USD"]))
  })

  it("returns one advice per supplier in a multi-supplier batch", () => {
    const advices = buildRemittanceAdvices(
      [ins({ supplier: "Acme" }), ins({ supplier: "Zenith" })],
      { name: "Test Co", runDate: new Date() },
    )
    expect(advices.map((a) => a.supplier).sort()).toEqual(["Acme", "Zenith"])
  })
})

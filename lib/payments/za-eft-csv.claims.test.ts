import { describe, expect, it } from "vitest"
import { buildClaimPaymentInstruction, formatZaEftCsv, validatePaymentInstructions } from "@/lib/payments/za-eft-csv"

describe("buildClaimPaymentInstruction", () => {
  it("produces an instruction that formats into a valid CSV row", () => {
    const ins = buildClaimPaymentInstruction({
      expenseClaimId: "c1", claimantName: "Jane Claimant", claimantEmail: "jane@example.com",
      title: "Client dinner", submittedAt: new Date("2026-09-01T00:00:00.000Z"),
      bankAccountNumber: "555000111", branchCode: "198765", amount: 420.75, currencyCode: "ZAR",
    })
    expect(validatePaymentInstructions([ins])).toEqual([])
    const csv = formatZaEftCsv([ins])
    expect(csv).toContain("Jane Claimant,555000111,198765,420.75,ZAR,Expense claim Client dinner,Expense claim Client dinner,jane@example.com")
  })

  it("falls back to submittedAt then the claim id when there is no title", () => {
    const withDate = buildClaimPaymentInstruction({
      expenseClaimId: "c2", claimantName: "Jane", claimantEmail: null, title: null,
      submittedAt: new Date("2026-08-15T00:00:00.000Z"), bankAccountNumber: "1", branchCode: "2",
      amount: 10, currencyCode: "ZAR",
    })
    expect(withDate.reference).toBe("Expense claim 2026-08-15")

    const withoutDate = buildClaimPaymentInstruction({
      expenseClaimId: "c3abcdef01", claimantName: "Jane", claimantEmail: null, title: null,
      submittedAt: null, bankAccountNumber: "1", branchCode: "2", amount: 10, currencyCode: "ZAR",
    })
    expect(withoutDate.reference).toBe("Expense claim c3abcdef")
  })

  it("validatePaymentInstructions catches a claim with no bank details", () => {
    const ins = buildClaimPaymentInstruction({
      expenseClaimId: "c4", claimantName: "Jane", claimantEmail: null, title: "Travel",
      submittedAt: null, bankAccountNumber: null, branchCode: null, amount: 10, currencyCode: "ZAR",
    })
    const errors = validatePaymentInstructions([ins])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/missing bank account/)
  })
})

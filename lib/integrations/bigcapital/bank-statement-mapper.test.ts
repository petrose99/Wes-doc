import { describe, it, expect } from "vitest"
import { extractBankStatementPayload, toBigcapitalCashflowBody } from "./bank-statement-mapper"

describe("extractBankStatementPayload", () => {
  it("extracts debit and credit transactions from reviewedData", () => {
    const reviewedData = {
      bank_name: "First National",
      currency_code: "ZAR",
      transactions: [
        { transaction_date: "2026-01-15", description: "Payment to XYZ", debit: 1500, credit: null },
        { transaction_date: "2026-01-16", description: "Deposit from ABC", debit: null, credit: 3000 },
      ],
    }
    const result = extractBankStatementPayload("doc-1", reviewedData, "acct-10", "acct-20")
    expect(result.documentType).toBe("bank_statement")
    expect(result.bankName).toBe("First National")
    expect(result.currencyCode).toBe("ZAR")
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0]).toEqual({ date: "2026-01-15", description: "Payment to XYZ", amount: 1500, type: "debit" })
    expect(result.transactions[1]).toEqual({ date: "2026-01-16", description: "Deposit from ABC", amount: 3000, type: "credit" })
  })

  it("skips rows with no debit or credit", () => {
    const reviewedData = {
      transactions: [
        { transaction_date: "2026-01-15", description: "Zero row", debit: null, credit: null },
        { transaction_date: "2026-01-16", description: "Valid", debit: 100 },
      ],
    }
    const result = extractBankStatementPayload("doc-2", reviewedData, "a", "b")
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].description).toBe("Valid")
  })

  it("handles missing transactions array", () => {
    const result = extractBankStatementPayload("doc-3", {}, "a", "b")
    expect(result.transactions).toHaveLength(0)
  })
})

describe("toBigcapitalCashflowBody", () => {
  it("maps a debit to other_expense", () => {
    const body = toBigcapitalCashflowBody(
      { date: "2026-01-15", description: "Office supplies", amount: 250, type: "debit" },
      "10", "20",
    )
    expect(body.transaction_type).toBe("other_expense")
    expect(body.amount).toBe(250)
    expect(body.cashflow_account_id).toBe(10)
    expect(body.credit_account_id).toBe(20)
  })

  it("maps a credit to other_income", () => {
    const body = toBigcapitalCashflowBody(
      { date: "2026-01-16", description: "Client payment", amount: 5000, type: "credit" },
      "10", "20",
    )
    expect(body.transaction_type).toBe("other_income")
    expect(body.amount).toBe(5000)
  })

  it("includes reference_no when provided", () => {
    const body = toBigcapitalCashflowBody(
      { date: "2026-01-17", description: "Ref test", amount: 100, type: "debit" },
      "10", "20", "REF-001",
    )
    expect(body.reference_no).toBe("REF-001")
  })

  it("omits reference_no when not provided", () => {
    const body = toBigcapitalCashflowBody(
      { date: "2026-01-17", description: "No ref", amount: 100, type: "debit" },
      "10", "20",
    )
    expect(body).not.toHaveProperty("reference_no")
  })
})

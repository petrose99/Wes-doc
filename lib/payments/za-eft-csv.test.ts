import { describe, expect, it } from "vitest"
import { formatZaEftCsv, paymentRunFilename, totalsByCurrency, validatePaymentInstructions, type PaymentInstruction } from "@/lib/payments/za-eft-csv"

const good: PaymentInstruction = {
  documentId: "d1", supplier: "Acme Ltd", bankAccountNumber: "1234567890", branchCode: "051001",
  amount: 1500.5, currencyCode: "ZAR", reference: "INV-042",
}

describe("validatePaymentInstructions", () => {
  it("returns no_instructions for an empty batch", () => {
    expect(validatePaymentInstructions([])).toEqual(["no_instructions"])
  })

  it("flags each row's specific problem so the UI can render every fix at once", () => {
    const errors = validatePaymentInstructions([
      { ...good, bankAccountNumber: null },
      { ...good, supplier: "" },
      { ...good, amount: 0 },
      { ...good, currencyCode: "R$" },
    ])
    expect(errors).toHaveLength(4)
    expect(errors[0]).toMatch(/missing bank account/)
    expect(errors[1]).toMatch(/missing supplier/)
    expect(errors[2]).toMatch(/amount must be a positive number/)
    expect(errors[3]).toMatch(/currency must be an ISO 4217 code/)
  })

  it("accepts a well-formed batch", () => {
    expect(validatePaymentInstructions([good])).toEqual([])
  })
})

describe("formatZaEftCsv", () => {
  it("emits an RFC-4180 CSV with a header row and CRLF line terminators", () => {
    const csv = formatZaEftCsv([good])
    const lines = csv.split("\r\n").filter(Boolean)
    expect(lines[0]).toBe("beneficiary_name,account_number,branch_code,amount,currency,your_reference,beneficiary_reference,beneficiary_email")
    expect(lines[1]).toBe("Acme Ltd,1234567890,051001,1500.50,ZAR,INV-042,INV-042,")
  })

  it("quotes and escapes fields containing commas or quotes", () => {
    const csv = formatZaEftCsv([{ ...good, supplier: `Acme, "Africa" Ltd`, reference: "REF\ntwo" }])
    expect(csv).toContain('"Acme, ""Africa"" Ltd"')
    expect(csv).toContain('"REF\ntwo"')
  })

  it("upcases the currency and formats the amount to two decimals", () => {
    const csv = formatZaEftCsv([{ ...good, currencyCode: "zar", amount: 1.5 }])
    expect(csv).toContain(",1.50,ZAR,")
  })
})

describe("totalsByCurrency", () => {
  it("sums amounts per currency across a mixed-currency batch", () => {
    const totals = totalsByCurrency([
      { ...good, amount: 100, currencyCode: "ZAR" },
      { ...good, amount: 200, currencyCode: "zar" },
      { ...good, amount: 50, currencyCode: "USD" },
    ])
    expect(totals).toEqual({ ZAR: 300, USD: 50 })
  })
})

describe("paymentRunFilename", () => {
  it("stamps the date and HHMM into the filename", () => {
    expect(paymentRunFilename(new Date("2026-09-10T14:35:00.000Z"))).toBe("payment-run-2026-09-10-1435.csv")
  })
})

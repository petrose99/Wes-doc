import { describe, expect, it } from "vitest"
import { checkBankDetails, maskIban } from "@/lib/checks/bank-details"

const IBAN_A = "DE89 3704 0044 0532 0130 00"
const IBAN_B = "GB29NWBK60161331926819"

describe("checkBankDetails", () => {
  it("is silent when the document carries no usable IBAN", () => {
    expect(checkBankDetails({ extractedIban: null, knownIban: IBAN_A, supplierName: "Acme" })).toBeNull()
    expect(checkBankDetails({ extractedIban: "account 12345", knownIban: IBAN_A, supplierName: "Acme" })).toBeNull()
  })

  it("passes and flags firstSeen when the supplier has no details on file", () => {
    const result = checkBankDetails({ extractedIban: IBAN_A, knownIban: null, supplierName: "Acme" })
    expect(result).toMatchObject({ checkCode: "bank_detail_change", status: "pass", detail: { firstSeen: true } })
  })

  it("passes when the IBAN matches the details on file, whatever the formatting", () => {
    const result = checkBankDetails({ extractedIban: IBAN_A, knownIban: "DE89370400440532013000", supplierName: "Acme" })
    expect(result?.status).toBe("pass")
    expect(result?.detail?.firstSeen).toBeUndefined()
  })

  it("FAILS when the IBAN differs from the details on file", () => {
    const result = checkBankDetails({ extractedIban: IBAN_B, knownIban: IBAN_A, supplierName: "Acme" })
    expect(result).toMatchObject({ checkCode: "bank_detail_change", status: "fail" })
    expect(result?.message).toContain("changed")
    // Full IBANs never appear in the human message, only masked.
    expect(result?.message).not.toContain("GB29NWBK60161331926819")
  })
})

describe("maskIban", () => {
  it("keeps only the ends", () => expect(maskIban("DE89370400440532013000")).toBe("DE89…3000"))
})

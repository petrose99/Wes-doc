import { describe, expect, it } from "vitest"
import { checkVendorOnboarding, type VendorOnboardingInput } from "@/lib/checks/vendor-onboarding"

const base: VendorOnboardingInput = {
  supplierName: "Acme Ltd",
  senderEmail: "billing@acme.com",
  supplierAddress: "1 High Street, London, United Kingdom",
  paymentIban: "GB29NWBK60161331926819",
  vatNumber: "GB123456789",
  vatFormatPass: true,
  supplierDocumentCount: 0,
}

describe("checkVendorOnboarding", () => {
  it("skips silently after the first document", () => {
    expect(checkVendorOnboarding({ ...base, supplierDocumentCount: 2 })).toBeNull()
  })

  it("passes for a clean new supplier", () => {
    expect(checkVendorOnboarding(base)).toBeNull()
  })

  it("flags a free-mail sender domain", () => {
    const result = checkVendorOnboarding({ ...base, senderEmail: "bob@gmail.com" })
    expect(result?.status).toBe("warn")
    expect(result?.message).toContain("free-mail")
  })

  it("flags a bad VAT format", () => {
    expect(checkVendorOnboarding({ ...base, vatFormatPass: false })?.status).toBe("warn")
  })

  it("flags an IBAN whose country disagrees with the address country", () => {
    // GB IBAN vs a German address.
    const result = checkVendorOnboarding({ ...base, supplierAddress: "Berliner Straße 1, Deutschland" })
    expect(result?.status).toBe("warn")
    expect(result?.message).toContain("IBAN country")
  })
})

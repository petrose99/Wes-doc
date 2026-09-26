import { describe, expect, it } from "vitest"
import { attachmentLimitViolation, DOCUBITE_MAX_BYTES } from "@/lib/integrations/attach-limits"

describe("attachmentLimitViolation", () => {
  it("passes a small PDF for either provider", () => {
    expect(attachmentLimitViolation("quickbooks", { contentType: "application/pdf", sizeBytes: 1000 })).toBeNull()
    expect(attachmentLimitViolation("xero", { contentType: "application/pdf", sizeBytes: 1000 })).toBeNull()
  })

  it("flags a type Xero doesn't take even though DocuBite and QBO would", () => {
    const violation = attachmentLimitViolation("xero", { contentType: "image/tiff", sizeBytes: 1000 })
    expect(violation?.code).toBe("attach_invalid_type")
    expect(attachmentLimitViolation("quickbooks", { contentType: "image/tiff", sizeBytes: 1000 })).toBeNull()
  })

  it("flags a file over Xero's 10 MB but within QBO's 100 MB", () => {
    const size = 11 * 1024 * 1024
    const violation = attachmentLimitViolation("xero", { contentType: "application/pdf", sizeBytes: size })
    expect(violation).toEqual({ code: "attach_oversize", text: "Xero takes files up to 10 MB; this one is 11 MB." })
    expect(attachmentLimitViolation("quickbooks", { contentType: "application/pdf", sizeBytes: size })).toBeNull()
  })

  it("flags DocuBite's own ceiling ahead of QBO's larger one", () => {
    const violation = attachmentLimitViolation("quickbooks", { contentType: "application/pdf", sizeBytes: DOCUBITE_MAX_BYTES + 1 })
    expect(violation?.code).toBe("attach_oversize")
    expect(violation?.text).toContain("DocuBite")
  })

  it("rejects a type outside both providers' lists", () => {
    expect(attachmentLimitViolation("quickbooks", { contentType: "application/zip", sizeBytes: 1000 })?.code).toBe("attach_invalid_type")
  })
})

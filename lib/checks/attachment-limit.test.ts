import { describe, expect, it } from "vitest"
import { checkAttachmentLimit } from "@/lib/checks/attachment-limit"

describe("checkAttachmentLimit", () => {
  it("passes silently for a file within every limit", () => {
    expect(checkAttachmentLimit({ provider: "xero", contentType: "application/pdf", sizeBytes: 1024 })).toBeNull()
  })

  it("warns on a Xero-oversize file", () => {
    const result = checkAttachmentLimit({ provider: "xero", contentType: "application/pdf", sizeBytes: 11 * 1024 * 1024 })
    expect(result?.status).toBe("warn")
    expect(result?.checkCode).toBe("attachment_limit")
    expect(result?.detail).toEqual({ code: "attach_oversize" })
  })

  it("warns on a QBO-invalid type", () => {
    const result = checkAttachmentLimit({ provider: "quickbooks", contentType: "application/zip", sizeBytes: 1024 })
    expect(result?.detail).toEqual({ code: "attach_invalid_type" })
  })

  it("warns on the DocuBite-wide ceiling regardless of provider", () => {
    const result = checkAttachmentLimit({ provider: "quickbooks", contentType: "application/pdf", sizeBytes: 60 * 1024 * 1024 })
    expect(result?.detail).toEqual({ code: "attach_oversize" })
  })
})

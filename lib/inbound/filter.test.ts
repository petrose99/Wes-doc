import { describe, expect, it } from "vitest"
import { classifyIntent, extractOriginalSender, shouldSkipAttachment } from "@/lib/inbound/filter"

describe("shouldSkipAttachment", () => {
  it("skips a small inline image (signature logo)", () => {
    expect(shouldSkipAttachment({ filename: "logo.png", contentType: "image/png", sizeBytes: 12_000, contentDisposition: "inline", contentId: "<logo1>" })).toBe(true)
  })
  it("keeps a large image attachment even inline", () => {
    expect(shouldSkipAttachment({ filename: "big.png", contentType: "image/png", sizeBytes: 250_000, contentDisposition: "inline" })).toBe(false)
  })
  it("keeps a PDF regardless of size/disposition", () => {
    expect(shouldSkipAttachment({ filename: "invoice.pdf", contentType: "application/pdf", sizeBytes: 10_000, contentDisposition: "inline" })).toBe(false)
  })
})

describe("classifyIntent", () => {
  it("catches invoices", () => expect(classifyIntent("Invoice #42", "amount due")).toBe("invoice"))
  it("catches statements", () => expect(classifyIntent("Your monthly statement", "opening balance")).toBe("statement"))
  it("labels noise", () => expect(classifyIntent("Weekly newsletter", "click to unsubscribe")).toBe("noise"))
  it("unknown when nothing hits", () => expect(classifyIntent("Hi there", "how are you")).toBe("unknown"))
})

describe("extractOriginalSender", () => {
  it("pulls the from address out of a forwarded quote", () => {
    const body = "Please process this.\n\n> From: Acme Billing <billing@acme.com>\n> Subject: Invoice"
    expect(extractOriginalSender(body)).toBe("billing@acme.com")
  })
  it("prefers the deepest quoted From when the chain is nested", () => {
    const body = "> From: Bookkeeper <bk@firm.com>\n>> From: Real Supplier <acct@supplier.com>"
    expect(extractOriginalSender(body)).toBe("acct@supplier.com")
  })
  it("returns null when there is no forwarded header", () => {
    expect(extractOriginalSender("just some text")).toBeNull()
  })
})

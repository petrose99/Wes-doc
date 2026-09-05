import { describe, expect, it } from "vitest"
import { isValidRedirectPath } from "@/lib/integrations/bigcapital/redirect-validator"

describe("isValidRedirectPath", () => {
  it("accepts a simple path", () => {
    expect(isValidRedirectPath("/bills/42")).toBe(true)
  })

  it("accepts a nested path", () => {
    expect(isValidRedirectPath("/bills/42/details")).toBe(true)
  })

  it("accepts hyphens and underscores", () => {
    expect(isValidRedirectPath("/some-page/my_section")).toBe(true)
  })

  it("rejects paths without leading slash", () => {
    expect(isValidRedirectPath("bills/42")).toBe(false)
  })

  it("rejects double slashes (open redirect vector)", () => {
    expect(isValidRedirectPath("//evil.com")).toBe(false)
  })

  it("rejects protocol-relative URLs", () => {
    expect(isValidRedirectPath("//evil.com/path")).toBe(false)
  })

  it("rejects paths with query strings", () => {
    expect(isValidRedirectPath("/bills?id=42")).toBe(false)
  })

  it("rejects paths with fragments", () => {
    expect(isValidRedirectPath("/bills#section")).toBe(false)
  })

  it("rejects paths with dots (directory traversal)", () => {
    expect(isValidRedirectPath("/bills/../etc/passwd")).toBe(false)
  })

  it("rejects empty string", () => {
    expect(isValidRedirectPath("")).toBe(false)
  })

  it("rejects bare slash", () => {
    expect(isValidRedirectPath("/")).toBe(false)
  })

  it("rejects paths with spaces", () => {
    expect(isValidRedirectPath("/bills/ /42")).toBe(false)
  })

  it("rejects absolute URLs", () => {
    expect(isValidRedirectPath("https://evil.com/bills")).toBe(false)
  })
})

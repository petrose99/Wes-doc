import { describe, expect, it } from "vitest"
import { labelForDestinationPath, originLabel, readOrigin, withOrigin, withParam } from "@/lib/navigation/origin"
import { documentDestinationPath } from "@/lib/typed-destinations"
import { DOC_TYPES } from "@/lib/doc-types"

const ws = "af91555d-7450-4b21-a8ac-73db092617c8"
const base = `/workspaces/${ws}`

describe("readOrigin (#268 §1)", () => {
  it("accepts an in-workspace path with a query", () => {
    expect(readOrigin({ from: `${base}/exceptions?doc=abc` }, ws)).toBe(`${base}/exceptions?doc=abc`)
  })
  it.each([
    ["off-site", "https://evil.example/x"],
    ["protocol-relative", "//evil.example/x"],
    ["backslash", `${base}\\exceptions`],
    ["dot segments", `${base}/../other`],
    ["another workspace", "/workspaces/other-ws/invoices"],
    ["over the cap", `${base}/invoices?q=${"a".repeat(2100)}`],
    ["relative", "invoices"],
  ])("rejects %s → null", (_name, value) => {
    expect(readOrigin({ from: value }, ws)).toBeNull()
  })
  it("reads the first of a repeated param and URLSearchParams-like inputs", () => {
    expect(readOrigin({ from: [`${base}/search?q=a`, "/x"] }, ws)).toBe(`${base}/search?q=a`)
    expect(readOrigin(new URLSearchParams({ from: `${base}/finance` }), ws)).toBe(`${base}/finance`)
    expect(readOrigin({}, ws)).toBeNull()
  })
})

describe("originLabel", () => {
  it.each([
    ["invoices", "Invoices"], ["purchase-orders", "Purchase Orders"], ["receipts", "Receipts"],
    ["bank-statements", "Bank Statements"], ["exceptions", "Exceptions"], ["approvals/invoices", "Approvals"],
    ["approvals/po-mismatches", "Approvals"], ["finance", "Finance"], ["search?q=x", "Search"], ["library/documents/abc", "Archive"],
  ])("%s → %s", (path, label) => {
    expect(originLabel(`${base}/${path}`)).toBe(label)
  })
  it("returns null for an unmapped or non-workspace path", () => {
    expect(originLabel(`${base}/admin`)).toBeNull()
    expect(originLabel("/login")).toBeNull()
  })
  it("covers every path documentDestinationPath can return (§2.4 fallback can never hide)", () => {
    for (const docType of [...DOC_TYPES, null, "unknown-type"]) {
      const path = documentDestinationPath(base, { id: "doc_1234567890", docType })
      expect(originLabel(path), path).not.toBeNull()
      expect(labelForDestinationPath(path)).toBe(originLabel(path))
    }
  })
})

describe("withOrigin / withParam", () => {
  it("appends from= verbatim and keeps existing params", () => {
    expect(withOrigin(`${base}/invoices/doc_1?full=1`, `${base}/exceptions?doc=x`)).toBe(`${base}/invoices/doc_1?full=1&from=${encodeURIComponent(`${base}/exceptions?doc=x`)}`)
  })
  it("leaves the href alone with no origin or a non-app href", () => {
    expect(withOrigin(`${base}/invoices`, null)).toBe(`${base}/invoices`)
    expect(withOrigin("https://x.example", `${base}/invoices`)).toBe("https://x.example")
  })
  it("chains, and drops the outermost from first past the cap", () => {
    const a = `${base}/invoices?q=${"a".repeat(1900)}`
    const b = withOrigin(`${base}/exceptions`, a)
    const c = withOrigin(`${base}/receipts/doc_1`, b)
    expect(c.length).toBeLessThanOrEqual(2048)
    const from = new URLSearchParams(c.split("?")[1]).get("from")!
    expect(from.startsWith(`${base}/exceptions`)).toBe(true)
    expect(new URLSearchParams(from.split("?")[1] ?? "").get("from")).toBeNull()
  })
  it("withParam adds gone= beside the existing query", () => {
    expect(withParam(`${base}/exceptions?status=open`, "gone", "doc_1")).toBe(`${base}/exceptions?status=open&gone=doc_1`)
  })
})

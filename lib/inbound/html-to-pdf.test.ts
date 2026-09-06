import { describe, expect, it } from "vitest"
import { htmlToText, looksInvoiceLike, renderEmailBodyPdf } from "@/lib/inbound/html-to-pdf"

describe("looksInvoiceLike", () => {
  it("needs both a billing keyword and an amount", () => {
    expect(looksInvoiceLike("Invoice #42", "Amount due: $150.00 by Friday")).toBe(true)
    expect(looksInvoiceLike("Dinner plans", "the bill was fun last night")).toBe(false)
    expect(looksInvoiceLike("Hey", "here's $5 for coffee")).toBe(false)
    expect(looksInvoiceLike(null, null)).toBe(false)
  })

  it("recognises currency-code amounts and keyword in subject only", () => {
    expect(looksInvoiceLike("Your receipt", "Total 49.99 USD, thanks!")).toBe(true)
  })
})

describe("htmlToText", () => {
  it("strips tags, decodes entities, keeps block structure", () => {
    const text = htmlToText("<div><h1>Invoice</h1><p>Total: &euro;? &amp; $10</p><style>p{color:red}</style></div>")
    expect(text).toContain("Invoice")
    expect(text).toContain("& $10")
    expect(text).not.toContain("color:red")
    expect(text.indexOf("Invoice")).toBeLessThan(text.indexOf("Total"))
  })

  it("turns table cells into tab-separated lines", () => {
    const text = htmlToText("<table><tr><td>Item</td><td>Amount</td></tr><tr><td>Widget</td><td>10.00</td></tr></table>")
    expect(text).toContain("Item\tAmount")
    expect(text).toContain("Widget\t10.00")
  })
})

describe("renderEmailBodyPdf", () => {
  it("produces a structurally valid PDF containing the body text", () => {
    const pdf = renderEmailBodyPdf({ subject: "Invoice #42", from: "billing@acme.com", bodyText: "Amount due: $150.00\nPay by 2026-10-01" })
    const raw = pdf.toString("latin1")
    expect(raw.startsWith("%PDF-1.4")).toBe(true)
    expect(raw).toContain("%%EOF")
    expect(raw).toContain("/Type /Catalog")
    expect(raw).toContain("Amount due: $150.00")
    expect(raw).toContain("billing@acme.com")
    expect(raw).toContain("Invoice #42")
  })

  it("escapes PDF-special characters and paginates long bodies", () => {
    const longBody = Array.from({ length: 200 }, (_, i) => `Line (${i}) with \\ backslash`).join("\n")
    const pdf = renderEmailBodyPdf({ subject: null, from: "a@b.c", bodyText: longBody })
    const raw = pdf.toString("latin1")
    expect(raw).toContain("\\(0\\)")
    const pageCount = raw.match(/\/Count (\d+)/)?.[1]
    expect(Number(pageCount)).toBeGreaterThan(1)
  })

  it("xref offsets point at the right objects", () => {
    const pdf = renderEmailBodyPdf({ subject: "s", from: "f@x.y", bodyText: "hello" })
    const raw = pdf.toString("latin1")
    const xrefStart = Number(raw.match(/startxref\n(\d+)\n/)?.[1])
    expect(raw.slice(xrefStart, xrefStart + 4)).toBe("xref")
    const firstOffset = Number(raw.match(/\n(\d{10}) 00000 n /)?.[1])
    expect(raw.slice(firstOffset, firstOffset + 7)).toBe("1 0 obj")
  })
})

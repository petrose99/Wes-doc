import { describe, expect, it } from "vitest"
import { findPdfLinks } from "@/lib/inbound/portal-links"

describe("findPdfLinks", () => {
  it("catches an https .pdf link and dedupes", () => {
    const body = "Invoice: https://vendor.com/inv/42.pdf and again https://vendor.com/inv/42.pdf"
    expect(findPdfLinks(body)).toEqual(["https://vendor.com/inv/42.pdf"])
  })

  it("ignores http links and non-.pdf paths", () => {
    expect(findPdfLinks("see http://vendor.com/inv/42.pdf")).toEqual([])
    expect(findPdfLinks("see https://vendor.com/inv/42")).toEqual([])
  })

  it("caps at 3 links per mail", () => {
    const body = Array.from({ length: 10 }, (_, i) => `https://vendor.com/${i}.pdf`).join(" ")
    expect(findPdfLinks(body)).toHaveLength(3)
  })
})

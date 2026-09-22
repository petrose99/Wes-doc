import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { OriginStrip } from "@/components/queue/origin-strip"

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim()
}

const href = "/workspaces/ws/exceptions?doc=doc_1"

describe("OriginStrip (#268 §2)", () => {
  it("renders nothing without an origin — no placeholder", () => {
    expect(renderToStaticMarkup(<OriginStrip origin={null} />)).toBe("")
    expect(renderToStaticMarkup(<OriginStrip origin={undefined} />)).toBe("")
  })

  it("renders label · title · suffix as one link named by its visible text, comma-joined", () => {
    const html = renderToStaticMarkup(<OriginStrip origin={{ href, label: "Exceptions", row: { title: "Acme Corp", suffix: "INV-1042" } }} />)
    expect(text(html)).toBe("Back to Exceptions · Acme Corp · INV-1042")
    expect(html).toContain('aria-label="Back to Exceptions, Acme Corp, INV-1042"')
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(html).not.toContain("sr-only")
    expect(html).toContain(`href="${href.replace(/&/g, "&amp;")}"`)
  })

  it("renders the search variant with quoted q and a filter count, omitting empties", () => {
    const html = renderToStaticMarkup(<OriginStrip origin={{ href: "/workspaces/ws/search?q=acme", label: "Search", search: { q: "acme", filterCount: 2 } }} />)
    expect(text(html)).toBe('Back to Search · "acme" · 2 filters')
    const bare = renderToStaticMarkup(<OriginStrip origin={{ href: "/workspaces/ws/search", label: "Search", search: { q: "", filterCount: 0 } }} />)
    expect(text(bare)).toBe("Back to Search")
    const one = renderToStaticMarkup(<OriginStrip origin={{ href: "/workspaces/ws/search?q=a&status=x", label: "Search", search: { q: "a", filterCount: 1 } }} />)
    expect(text(one)).toContain("1 filter")
  })

  it("renders a label-only origin without separators", () => {
    expect(text(renderToStaticMarkup(<OriginStrip origin={{ href: "/workspaces/ws/finance", label: "Finance" }} />))).toBe("Back to Finance")
  })
})

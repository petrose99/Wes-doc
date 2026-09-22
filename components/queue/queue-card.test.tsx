import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DETAIL_PANE_ID } from "@/components/queue/detail-pane"
import { QueueCard, joinSegments } from "@/components/queue/queue-card"

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

const base = { href: "/app/invoices/inv_1", label: "Acme Ltd, INV-001, R 1 200,00", isOpen: false, onOpen: () => {} }

describe("QueueCard (#261)", () => {
  it("renders the four slots in order: leading, title + trailing, subtitle, pill", () => {
    const html = renderToStaticMarkup(
      <QueueCard {...base} leading={<i>◉</i>} title="Acme Ltd" trailing="R 1 200,00" subtitle={joinSegments(["INV-001", "Due 30 Sep"])} pill={<b>Approved</b>} />,
    )
    expect(text(html)).toBe("◉ Acme Ltd R 1 200,00 INV-001 · Due 30 Sep Approved")
  })

  it("omits the subtitle, trailing and pill wrappers when the slot is empty", () => {
    const html = renderToStaticMarkup(<QueueCard {...base} title="Acme Ltd" />)
    expect(text(html)).toBe("Acme Ltd")
    expect(html).not.toContain("line-clamp-2")
    expect(html).not.toContain("mt-0.5")
    expect(html).not.toContain("mt-1 flex")
  })

  it("is one anchor to the deep-link route with an explicit aria-label and pane wiring", () => {
    const html = renderToStaticMarkup(<QueueCard {...base} title="Acme Ltd" />)
    expect(html).toContain(`href="${base.href}"`)
    expect(html).toContain(`aria-label="${base.label}"`)
    expect(html).toContain(`aria-controls="${DETAIL_PANE_ID}"`)
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain("aria-current")
  })

  it("marks the open row with aria-current and the open tint", () => {
    const html = renderToStaticMarkup(<QueueCard {...base} isOpen title="Acme Ltd" />)
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain("bg-emerald-50/60")
  })

  it("clamps the subtitle to two lines only when asked", () => {
    expect(renderToStaticMarkup(<QueueCard {...base} title="x" subtitle="long check message" subtitleClamp />)).toContain("line-clamp-2")
    expect(renderToStaticMarkup(<QueueCard {...base} title="x" subtitle="short" />)).toContain("truncate")
  })
})

describe("joinSegments (#261)", () => {
  it("joins present segments with a middle dot and drops empty ones", () => {
    expect(text(renderToStaticMarkup(<>{joinSegments(["INV-001", null, "", undefined, false, "Due 30 Sep"])}</>))).toBe("INV-001 · Due 30 Sep")
  })

  it("renders a single segment without a separator and nothing for none", () => {
    expect(text(renderToStaticMarkup(<>{joinSegments(["INV-001"])}</>))).toBe("INV-001")
    expect(text(renderToStaticMarkup(<>{joinSegments([null, ""])}</>))).toBe("")
  })
})

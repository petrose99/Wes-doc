import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { StatePills } from "@/components/queue/row-cells"
import { PROCESSING_STATES, PROCESSING_STATE_LABELS } from "@/lib/documents/processing-state"

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

describe("StatePills (#258)", () => {
  it("prints the vocabulary's label for each of the five states", () => {
    for (const state of PROCESSING_STATES) {
      expect(text(renderToStaticMarkup(<StatePills state={state} />))).toBe(PROCESSING_STATE_LABELS[state])
    }
  })

  it("suffixes the open-check count on Needs attention only when there is one", () => {
    expect(text(renderToStaticMarkup(<StatePills state="needs_attention" openCheckCodes={["a", "b"]} />))).toBe("Needs attention · 2")
    expect(text(renderToStaticMarkup(<StatePills state="needs_attention" openCheckCodes={[]} />))).toBe("Needs attention")
    expect(text(renderToStaticMarkup(<StatePills state="approved" openCheckCodes={["a"]} />))).toBe("Approved")
  })

  it("maps ledger keys to Posted / Paid and passes an unknown key through", () => {
    expect(text(renderToStaticMarkup(<StatePills state="approved" ledger="synced" />))).toBe("Approved Posted")
    expect(text(renderToStaticMarkup(<StatePills state="approved" ledger="paid" />))).toBe("Approved Paid")
    expect(text(renderToStaticMarkup(<StatePills state="approved" ledger="other" />))).toBe("Approved other")
  })

  it("carries the cancelled reason as the pill's title", () => {
    expect(renderToStaticMarkup(<StatePills state="cancelled" cancelledReason="Duplicate" />)).toContain('title="Duplicate"')
  })
})

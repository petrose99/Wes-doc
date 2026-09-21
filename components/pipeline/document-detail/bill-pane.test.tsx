import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// #361 step 1/2: BillPane only needs `useRegisterDocumentActions` from this module — mock it to
// that one hook so the test doesn't pull in server actions/toast (same pattern as status-line.test.tsx).
vi.mock("@/components/queue/document-actions-menu", () => ({
  useRegisterDocumentActions: () => {},
}))

import { BillPane } from "@/components/pipeline/document-detail/bill-pane"
import type { RegisteredDocument } from "@/components/queue/document-actions-menu"

const DOC: RegisteredDocument = {
  workspaceId: "w1", documentId: "d1", fileId: "f1", filename: "invoice.pdf",
  flagged: false, archived: false, cancelled: false,
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

describe("BillPane (#361)", () => {
  it("omits the Open in <Provider> link when providerLink is null (#355 Q2)", () => {
    const html = renderToStaticMarkup(<BillPane document={DOC} providerLink={null} fileHref="/f1" viewer={<div>viewer</div>} form={<div>form</div>} />)
    expect(html).not.toContain("Open in")
    expect(text(html)).toContain("viewer")
    expect(text(html)).toContain("form")
  })

  it("renders the provider link when given one", () => {
    const html = renderToStaticMarkup(<BillPane document={DOC} providerLink={{ href: "/api/accounting/session?workspaceId=w1", label: "Open in Bigcapital" }} fileHref="/f1" viewer={<div>viewer</div>} form={<div>form</div>} />)
    expect(html).toContain("Open in Bigcapital")
    expect(html).toContain("/api/accounting/session?workspaceId=w1")
  })

  it("renders one Open-file control, aria-labelled, not sr-only inside the button (lesson #261)", () => {
    const html = renderToStaticMarkup(<BillPane document={DOC} providerLink={null} fileHref="/f1" viewer={<div>viewer</div>} form={<div>form</div>} />)
    expect(html).toContain('aria-label="Open file in a new tab"')
    expect(html).not.toContain("sr-only")
  })

  it("renders the resize grip as a separator with keyboard bounds", () => {
    const html = renderToStaticMarkup(<BillPane document={DOC} providerLink={null} fileHref="/f1" viewer={<div>viewer</div>} form={<div>form</div>} />)
    expect(html).toContain('role="separator"')
    expect(html).toContain('aria-orientation="vertical"')
  })
})

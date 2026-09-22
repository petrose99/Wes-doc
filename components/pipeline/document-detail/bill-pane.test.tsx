import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// #361 step 1/2: BillPane only needs `useRegisterDocumentActions` from this module — mock it to
// that one hook so the test doesn't pull in server actions/toast (same pattern as status-line.test.tsx).
vi.mock("@/components/queue/document-actions-menu", async () => {
  const { createContext } = await import("react")
  return { useRegisterDocumentActions: () => {}, PaneDocumentContext: createContext<unknown>(null) }
})

// #361 step 3: BillStatusTrack's Reject button calls this server action on confirm only — the
// static-render tests below never click it, but the module import still needs a mock so it
// doesn't pull the real DB layer into the test.
vi.mock("@/app/(app)/workspaces/[workspaceId]/review-actions", () => ({
  updateReviewTaskStatusAction: async () => ({ success: true, data: null }),
}))

// #361 step 4: BillFooterActions' Approve/Post calls — mocked so the click tests below never
// touch the real DB layer.
const moveDocumentsToStageAction = vi.fn(async () => ({ success: true, data: { moved: 1 } }))
vi.mock("@/app/(app)/workspaces/[workspaceId]/pipeline-actions", () => ({
  moveDocumentsToStageAction: (...args: unknown[]) => moveDocumentsToStageAction(...args),
}))
const postSelectedDocumentsAction = vi.fn(async () => ({ success: true, data: { posted: 1, failed: 0, results: [{ documentId: "d1", status: "succeeded" }] } }))
vi.mock("@/app/(app)/workspaces/[workspaceId]/post-selected-documents-actions", () => ({
  postSelectedDocumentsAction: (...args: unknown[]) => postSelectedDocumentsAction(...args),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { BillFooterActions, BillPane, BillStatusTrack } from "@/components/pipeline/document-detail/bill-pane"
import type { RegisteredDocument } from "@/components/queue/document-actions-menu"
import { processingFact } from "@/lib/documents/processing-fact"
import { processingState } from "@/lib/documents/processing-state"

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

function trackInput(overrides: Partial<{ approvalStatus: "not_started" | "in_progress" | "approved" | "rejected" | "cancelled", blockedByCheck: boolean, escalated: boolean, touchless: boolean, status: string, openCheckCodes: string[] }> = {}) {
  return { approvalStatus: "not_started" as const, blockedByCheck: false, escalated: false, touchless: false, status: "in_review", openCheckCodes: [], ...overrides }
}

function track(overrides: Parameters<typeof trackInput>[0] = {}, extra: Partial<{ paidAt: Date | null, rejectedByActor: string | null }> = {}) {
  const input = trackInput(overrides)
  const state = processingState(input)
  const fact = processingFact(input)
  return <BillStatusTrack workspaceId="w1" openReviewTaskId="t1" state={state} fact={fact} openCheckCodes={input.openCheckCodes}
    blockedByCheck={input.blockedByCheck} escalated={input.escalated} approvalStatus={input.approvalStatus} onDone={() => {}} {...extra} />
}

describe("BillStatusTrack (#361 step 3)", () => {
  it("renders no checks line and no Approval block when nothing is open (state #9)", () => {
    const html = text(renderToStaticMarkup(track()))
    expect(html).not.toContain("open check")
    expect(html).not.toContain("Blocked")
  })

  it("renders the checks summary line and a Blocked Approval block when blocked (state #2)", () => {
    const html = text(renderToStaticMarkup(track({ blockedByCheck: true, openCheckCodes: ["dup"] })))
    expect(html).toContain("1 open check")
    expect(html).toContain("Blocked — 1 open check must clear first")
  })

  it("renders an Escalated block without a checks count when escalated, no checks open", () => {
    const html = text(renderToStaticMarkup(track({ escalated: true })))
    expect(html).toContain("Escalated — waiting on a reviewer")
  })

  it("renders a Rejected block with the actor's name when known (state #8)", () => {
    const html = text(renderToStaticMarkup(track({ approvalStatus: "rejected" }, { rejectedByActor: "Nadia K." })))
    expect(html).toContain("Rejected by Nadia K.")
  })

  it("shows the Reject button only while an approval is in progress", () => {
    const blocked = renderToStaticMarkup(track({ blockedByCheck: true, approvalStatus: "in_progress" }))
    expect(blocked).toContain(">Reject<")
    const rejected = renderToStaticMarkup(track({ approvalStatus: "rejected" }))
    expect(rejected).not.toContain(">Reject<")
  })

  it("appends the trailing Paid date to the fact sentence when paidAt is given", () => {
    const html = text(renderToStaticMarkup(track({ approvalStatus: "approved", status: "reviewed" }, { paidAt: new Date("2026-09-12T00:00:00Z") })))
    expect(html).toContain("· Paid Sep 12, 2026")
  })
})

describe("BillFooterActions (#361 step 4, #355 Q5)", () => {
  it("renders nothing in read-only mode", () => {
    const html = renderToStaticMarkup(<BillFooterActions workspaceId="w1" documentId="d1" connectionId="c1" mode="read-only" openReviewTaskId={null} blocked={false} onDone={() => {}} />)
    expect(html).toBe("")
  })

  it("renders a disabled Approve while blocked, enabled once clear — same #save-review-submit id either way", () => {
    const blockedHtml = renderToStaticMarkup(<BillFooterActions workspaceId="w1" documentId="d1" connectionId="c1" mode="approve" openReviewTaskId={null} blocked onDone={() => {}} />)
    expect(blockedHtml).toContain('id="save-review-submit"')
    expect(blockedHtml).toContain('disabled=""')
    const clearHtml = renderToStaticMarkup(<BillFooterActions workspaceId="w1" documentId="d1" connectionId="c1" mode="approve" openReviewTaskId={null} blocked={false} onDone={() => {}} />)
    expect(clearHtml).toContain('id="save-review-submit"')
    expect(clearHtml).not.toContain('disabled=""')
    expect(text(clearHtml)).toContain("Approve")
  })

  it("disables Post with no connection, enables it with one, and labels it Post not Approve", () => {
    const noConnHtml = renderToStaticMarkup(<BillFooterActions workspaceId="w1" documentId="d1" connectionId={null} mode="post" openReviewTaskId={null} blocked={false} onDone={() => {}} />)
    expect(noConnHtml).toContain('disabled=""')
    const connHtml = renderToStaticMarkup(<BillFooterActions workspaceId="w1" documentId="d1" connectionId="c1" mode="post" openReviewTaskId={null} blocked={false} onDone={() => {}} />)
    expect(connHtml).not.toContain('disabled=""')
    expect(text(connHtml)).toContain("Post")
  })
})

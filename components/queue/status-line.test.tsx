import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// The ⋯ menu's file pulls in server actions and the toast library; the Status line only needs
// its context object. Mock the module to that one export.
vi.mock("@/components/queue/document-actions-menu", async () => {
  const { createContext } = await import("react")
  return { PaneDocumentContext: createContext<unknown>(null) }
})

import { PaneDocumentContext } from "@/components/queue/document-actions-menu"
import { StatusLine } from "@/components/queue/status-line"
import { processingFact, type ProcessingFactInput } from "@/lib/documents/processing-fact"

const NOW = new Date("2026-09-16T10:00:00Z")

function input(overrides: Partial<ProcessingFactInput> = {}): ProcessingFactInput {
  return { approvalStatus: "approved", blockedByCheck: false, escalated: false, touchless: false, status: "reviewed", now: NOW, ...overrides }
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function withDoc(decision: { kind: "approved" | "rejected"; actorName: string | null; at: string } | null, node: React.ReactNode) {
  const Provider = PaneDocumentContext.Provider as React.Provider<unknown>
  return <Provider value={{ doc: { documentId: "d1", decision }, setDoc: () => {}, archivedToast: { archived: "Archived", unarchived: "Unarchived" } }}>{node}</Provider>
}

describe("StatusLine (#258)", () => {
  it("renders the row-derived sentence with role=status, no context needed", () => {
    const fact = processingFact(input({ approvalStatus: "in_progress", reviewTaskOpenedAt: new Date("2026-09-15T08:00:00Z") }))
    const html = renderToStaticMarkup(<StatusLine state={fact.state} fact={fact} />)
    expect(html).toMatch(/role="status"/)
    expect(text(html)).toBe("In review · opened yesterday")
  })

  it("upgrades an actor-less Approved sentence once the pane's decision lands", () => {
    const fact = processingFact(input())
    const before = renderToStaticMarkup(<StatusLine state={fact.state} fact={fact} />)
    expect(text(before)).toBe("Approved")
    const after = renderToStaticMarkup(withDoc({ kind: "approved", actorName: "Nadia K.", at: "2026-09-12T14:02:00Z" }, <StatusLine state={fact.state} fact={fact} />))
    expect(text(after)).toBe("Approved by Nadia K. · Sep 12, 2026")
  })

  it("names the rejecting actor from the decision, and leaves other states alone", () => {
    const rejected = processingFact(input({ approvalStatus: "rejected" }))
    const html = renderToStaticMarkup(withDoc({ kind: "rejected", actorName: "Sam R.", at: "2026-09-12T14:02:00Z" }, <StatusLine state={rejected.state} fact={rejected} />))
    expect(text(html)).toBe("Needs attention · rejected by Sam R.")
    const inReview = processingFact(input({ status: "needs_review" }))
    const untouched = renderToStaticMarkup(withDoc({ kind: "approved", actorName: "Nadia K.", at: "2026-09-12T14:02:00Z" }, <StatusLine state={inReview.state} fact={inReview} />))
    expect(text(untouched)).toBe("In review")
  })

  it("truncates a long actor name at 24 characters and keeps the whole name in title", () => {
    const name = "Bartholomew Fitzgerald-Montague"
    const fact = processingFact(input({ approvedBy: { actorName: name, at: new Date("2026-09-12T14:02:00Z") } }))
    const html = renderToStaticMarkup(<StatusLine state={fact.state} fact={fact} />)
    expect(html).toContain(`title="${name}"`)
    expect(text(html)).toBe("Approved by Bartholomew Fitzgerald-… · Sep 12, 2026")
  })

  it("truncates a cancelled reason at 80 characters", () => {
    const reason = "x".repeat(100)
    const fact = processingFact(input({ approvalStatus: "cancelled", cancelledReason: reason }))
    const html = renderToStaticMarkup(<StatusLine state={fact.state} fact={fact} cancelledReason={reason} />)
    expect(text(html)).toBe(`Cancelled · ${"x".repeat(80)}…`)
  })
})

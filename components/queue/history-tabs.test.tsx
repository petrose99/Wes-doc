import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// The history tabs file imports a server action (Prisma) and the override-mode context; the
// timeline itself is pure. Stub the heavy modules to keep this a markup test.
vi.mock("@/app/(app)/workspaces/[workspaceId]/actions", () => ({ overrideGateAction: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { ApprovalTimeline } from "@/components/queue/history-tabs"

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

const none = { decisions: [], pendingStages: [] }

describe("ApprovalTimeline with no workflow (#258 — never empty on Approved/Touchless)", () => {
  it("approved from the queue: actor, time, and the no-flow footer", () => {
    const html = renderToStaticMarkup(<ApprovalTimeline {...none} state="approved" reviewed={{ at: "2026-09-12T14:02:00Z", actorName: "Nadia K." }} />)
    const t = text(html)
    expect(t).toContain("Nadia K. reviewed and approved")
    expect(t).toContain("Sep 12, 2026")
    expect(t).toContain("No approval flow ran — approved from the queue.")
    expect(html).toContain('aria-label="Approval timeline"')
  })

  it("approved with no actor on record degrades to the DocuBite mark", () => {
    const t = text(renderToStaticMarkup(<ApprovalTimeline {...none} state="approved" reviewed={{ at: "2026-09-12T14:02:00Z", actorName: null }} />))
    expect(t).toContain("Reviewed and approved")
    expect(t).not.toContain("null")
  })

  it("touchless: sent automatically, with the workspace threshold when known", () => {
    const withThreshold = text(renderToStaticMarkup(<ApprovalTimeline {...none} state="touchless" touchless={{ thresholdPercent: 90 }} reviewed={{ at: "2026-09-12T14:02:00Z", actorName: null }} />))
    expect(withThreshold).toContain("Sent automatically")
    expect(withThreshold).toContain("All fields met the 90% threshold; nobody reviewed it.")
    const without = text(renderToStaticMarkup(<ApprovalTimeline {...none} state="touchless" />))
    expect(without).toContain("All fields met the threshold; nobody reviewed it.")
  })

  it("in review with no flow names the two real paths, per queue", () => {
    expect(text(renderToStaticMarkup(<ApprovalTimeline {...none} state="in_review" queueTitle="Invoices" />)))
      .toBe("No approval started. Start approval from the Invoices bulk bar, or approve from the pane.")
    expect(text(renderToStaticMarkup(<ApprovalTimeline {...none} state="in_review" queueTitle="Receipts" />)))
      .toBe("No approval started. Approve from the pane.")
  })

  it("cancelled with no rows mirrors the Status line", () => {
    expect(text(renderToStaticMarkup(<ApprovalTimeline {...none} state="cancelled" cancelledReason="Duplicate of INV-12" />))).toBe("Cancelled · Duplicate of INV-12")
    expect(text(renderToStaticMarkup(<ApprovalTimeline {...none} state="cancelled" />))).toBe("Cancelled")
  })

  it("rejected stage decisions render the existing timeline with the actor and note", () => {
    const decisions = [{ id: "s1", stageIndex: 0, stageName: "Manager", decision: "reject" as const, note: "Wrong PO", actorName: "Sam R.", decidedAt: "2026-09-12T14:02:00Z" }]
    const t = text(renderToStaticMarkup(<ApprovalTimeline decisions={decisions} pendingStages={[]} state="needs_attention" />))
    expect(t).toContain("Sam R.")
    expect(t).toContain("Wrong PO")
    expect(t).not.toContain("No approval steps yet")
  })
})

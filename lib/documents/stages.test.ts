import { LEGACY_STAGE_ALIASES, PIPELINE_STAGES, documentStage, normalizeStatus, parseStageAlias, stageToStatusFilter, STAGE_LABELS } from "@/lib/documents/stages"
import { describe, expect, it } from "vitest"

/** Locks in three things at once:
 *
 * 1. The stage vocabulary is the five-word lifecycle the audit demanded — nothing else, nothing
 *    less — and every stage has a user-visible label.
 * 2. `documentStage`'s precedence: Paid > Synced > Review > Approved > Inbox. A paid bill with a
 *    stale open review task lands on Paid; the money moved regardless of what the queue thinks.
 * 3. `parseStageAlias` accepts the canonical set and every kept legacy alias (`to_review`,
 *    `ready`) — the API contract Zapier and webhook consumers still write against — and refuses
 *    anything else. */
describe("PIPELINE_STAGES", () => {
  it("is the five-word lifecycle", () => {
    expect(PIPELINE_STAGES).toEqual(["inbox", "review", "approved", "synced", "paid"])
    for (const stage of PIPELINE_STAGES) expect(STAGE_LABELS[stage]).toBeTruthy()
  })
})

describe("parseStageAlias", () => {
  it("passes canonical names through", () => {
    for (const stage of PIPELINE_STAGES) expect(parseStageAlias(stage)).toBe(stage)
  })
  it("maps the two kept legacy aliases", () => {
    expect(parseStageAlias("to_review")).toBe("review")
    expect(parseStageAlias("ready")).toBe("approved")
    expect(Object.keys(LEGACY_STAGE_ALIASES).sort()).toEqual(["ready", "to_review"])
  })
  it("returns null for unknown stages and empty input", () => {
    expect(parseStageAlias("garbage")).toBeNull()
    expect(parseStageAlias(null)).toBeNull()
    expect(parseStageAlias(undefined)).toBeNull()
    expect(parseStageAlias("")).toBeNull()
  })
})

describe("documentStage precedence", () => {
  it("Paid wins over every other axis", () => {
    expect(documentStage({ status: "reviewed", paymentStatus: "paid" }, { hasSucceededPush: true, openReviewTask: true })).toBe("paid")
  })
  it("Synced beats Review and Approved", () => {
    expect(documentStage({ status: "reviewed", paymentStatus: null }, { hasSucceededPush: true, openReviewTask: true })).toBe("synced")
  })
  it("open review task on a reviewed document is still Review", () => {
    expect(documentStage({ status: "reviewed" }, { openReviewTask: true })).toBe("review")
  })
  it("needs_review / ready_for_review land on Review regardless of context", () => {
    expect(documentStage({ status: "needs_review" })).toBe("review")
    expect(documentStage({ status: "ready_for_review" })).toBe("review")
  })
  it("reviewed with nothing else set is Approved", () => {
    expect(documentStage({ status: "reviewed" })).toBe("approved")
  })
  it("queued and failed land on Inbox", () => {
    expect(documentStage({ status: "queued" })).toBe("inbox")
    expect(documentStage({ status: "failed" })).toBe("inbox")
  })
})

describe("normalizeStatus", () => {
  it("folds the phantom 'received' and 'extracted' back to queued", () => {
    expect(normalizeStatus("received")).toBe("queued")
    expect(normalizeStatus("extracted")).toBe("queued")
  })
})

describe("stageToStatusFilter", () => {
  it("returns a raw-status axis for each stage — sanity-check only, the full predicate lives in models/documents.ts", () => {
    expect(stageToStatusFilter("inbox")).toEqual({ status: { in: ["queued", "failed"] } })
    expect(stageToStatusFilter("paid")).toEqual({ status: "reviewed" })
  })
})

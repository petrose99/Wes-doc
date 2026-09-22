import { describe, expect, it } from "vitest"
import { emptyQueueState } from "./empty-state"

describe("emptyQueueState (#264 spec §2)", () => {
  it("renders rows whenever any exist", () => {
    expect(emptyQueueState({ workspaceDocumentCount: 0, rowCount: 1, filtered: true, hasFirstUse: true })).toBeNull()
  })
  it("first-use outranks filtered on a never-populated workspace", () => {
    expect(emptyQueueState({ workspaceDocumentCount: 0, rowCount: 0, filtered: true, hasFirstUse: true })).toBe("first-use")
  })
  it("falls through to filtered/done when the queue has no first-use copy", () => {
    expect(emptyQueueState({ workspaceDocumentCount: 0, rowCount: 0, filtered: true, hasFirstUse: false })).toBe("filtered")
    expect(emptyQueueState({ workspaceDocumentCount: 0, rowCount: 0, filtered: false, hasFirstUse: false })).toBe("done")
  })
  it("never shows first-use once the workspace holds any document (#241 d.10)", () => {
    expect(emptyQueueState({ workspaceDocumentCount: 1, rowCount: 0, filtered: false, hasFirstUse: true })).toBe("done")
    expect(emptyQueueState({ workspaceDocumentCount: 1, rowCount: 0, filtered: true, hasFirstUse: true })).toBe("filtered")
  })
})

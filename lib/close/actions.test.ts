import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn(() => { throw new Error("no request scope") }),
}))

const closeFindUnique = vi.fn()
const closeCreate = vi.fn()
const closeUpdate = vi.fn()
const closeItemUpdateMany = vi.fn()
const gateFindMany = vi.fn()
const workspaceFindUnique = vi.fn()
const workspaceMemberCount = vi.fn()
const workspaceMemberFindFirst = vi.fn()
const auditCreate = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    close: { findUnique: closeFindUnique, create: closeCreate, update: closeUpdate },
    closeItem: { updateMany: closeItemUpdateMany },
    gate: { findMany: gateFindMany },
    workspace: { findUnique: workspaceFindUnique },
    workspaceMember: { count: workspaceMemberCount, findFirst: workspaceMemberFindFirst },
    auditEvent: { create: auditCreate },
  },
}))

const {
  openClose,
  lockClose,
  reopenClose,
  relockClose,
  isVatPeriodEnd,
  CloseNotFoundError,
  CloseAlreadyOpenError,
  CloseLockBlockedByGatesError,
  CloseLockRequiresReviewerActorError,
  CloseWrongStateError,
} = await import("./actions")

const closeRow = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  workspaceId: "w1",
  periodYear: 2026,
  periodMonth: 8,
  state: "open",
  vatPeriodEnd: true,
  packCode: null,
  packVersion: null,
  openedAt: new Date(),
  openedById: "u1",
  lockedAt: null,
  lockedById: null,
  lastReopenedAt: null,
  lastReopenedById: null,
  reopenReason: null,
  lockSnapshot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
})

beforeEach(() => {
  closeFindUnique.mockReset()
  closeCreate.mockReset()
  closeUpdate.mockReset()
  closeItemUpdateMany.mockReset()
  gateFindMany.mockReset()
  workspaceFindUnique.mockReset()
  workspaceMemberCount.mockReset()
  workspaceMemberFindFirst.mockReset()
  auditCreate.mockReset()
  // Default: firm mode with the lock actor as reviewer of record. Tests that need SMB or a
  // non-signing actor override these two mocks per-case.
  workspaceMemberCount.mockResolvedValue(1)
  workspaceMemberFindFirst.mockResolvedValue({ user: { id: "u1", name: "Ann Reviewer" } })
})

describe("isVatPeriodEnd", () => {
  it("true for a pack with a filings topic (ZA VAT201, monthly)", () => {
    expect(isVatPeriodEnd("ZA", 2026, 8)).toBe(true)
    expect(isVatPeriodEnd("LS", 2026, 8)).toBe(true)
  })
  it("false when no jurisdiction is set — a workspace with no pack has no VAT layer to flag", () => {
    expect(isVatPeriodEnd(null, 2026, 8)).toBe(false)
  })
})

describe("openClose", () => {
  it("creates the Close, materializes items per pack, and emits close.opened", async () => {
    closeFindUnique.mockResolvedValue(null)
    workspaceFindUnique.mockResolvedValue({ jurisdictionCode: "ZA" })
    // Return a close with the four expected items for ZA + VAT period end.
    closeCreate.mockResolvedValue(
      closeRow({
        items: [
          { kind: "bank-recon" },
          { kind: "ap-aging" },
          { kind: "unposted-bill-accruals" },
          { kind: "vat-workpaper" },
        ],
      }),
    )
    const close = await openClose({ workspaceId: "w1", year: 2026, month: 8, actorId: "u1" })
    expect(close.items.map((i) => i.kind)).toEqual([
      "bank-recon",
      "ap-aging",
      "unposted-bill-accruals",
      "vat-workpaper",
    ])
    // create() was called with items nested under `create` — the descriptor list.
    const createArgs = closeCreate.mock.calls[0][0]
    expect(createArgs.data.vatPeriodEnd).toBe(true)
    expect(createArgs.data.items.create.map((d: { kind: string }) => d.kind)).toEqual([
      "bank-recon",
      "ap-aging",
      "unposted-bill-accruals",
      "vat-workpaper",
    ])
    const event = auditCreate.mock.calls[0][0].data
    expect(event.type).toBe("close.opened")
    expect(event.payload).toMatchObject({ periodYear: 2026, periodMonth: 8, vatPeriodEnd: true, packCode: "ZA" })
  })

  it("LS pack adds a cross-border-review row alongside the VAT workpaper", async () => {
    closeFindUnique.mockResolvedValue(null)
    workspaceFindUnique.mockResolvedValue({ jurisdictionCode: "LS" })
    closeCreate.mockResolvedValue(closeRow({ items: [] }))
    await openClose({ workspaceId: "w1", year: 2026, month: 8, actorId: "u1" })
    const items = closeCreate.mock.calls[0][0].data.items.create as Array<{ kind: string }>
    expect(items.map((i) => i.kind)).toEqual([
      "bank-recon",
      "ap-aging",
      "unposted-bill-accruals",
      "vat-workpaper",
      "cross-border-review",
    ])
  })

  it("workspace with no jurisdiction gets the common set only — no VAT, no cross-border", async () => {
    closeFindUnique.mockResolvedValue(null)
    workspaceFindUnique.mockResolvedValue({ jurisdictionCode: null })
    closeCreate.mockResolvedValue(closeRow({ vatPeriodEnd: false, items: [] }))
    await openClose({ workspaceId: "w1", year: 2026, month: 8, actorId: null })
    const items = closeCreate.mock.calls[0][0].data.items.create as Array<{ kind: string }>
    expect(items.map((i) => i.kind)).toEqual(["bank-recon", "ap-aging", "unposted-bill-accruals"])
    expect(closeCreate.mock.calls[0][0].data.vatPeriodEnd).toBe(false)
  })

  it("refuses a second open for the same (workspace, year, month) — monthly cadence, one row per period", async () => {
    closeFindUnique.mockResolvedValue(closeRow())
    await expect(
      openClose({ workspaceId: "w1", year: 2026, month: 8, actorId: "u1" }),
    ).rejects.toBeInstanceOf(CloseAlreadyOpenError)
    expect(closeCreate).not.toHaveBeenCalled()
  })

  it("rejects an out-of-range month value up front", async () => {
    await expect(openClose({ workspaceId: "w1", year: 2026, month: 13 })).rejects.toThrow(/1\.\.12/)
  })
})

describe("lockClose", () => {
  it("blocks lock when there is any open, hard-severity gate — the AP-exceptions hard gate", async () => {
    closeFindUnique.mockResolvedValue(closeRow({ state: "open" }))
    gateFindMany.mockResolvedValue([{ id: "g1" }, { id: "g2" }])
    await expect(lockClose({ closeId: "c1", actorId: "u1" })).rejects.toBeInstanceOf(
      CloseLockBlockedByGatesError,
    )
    expect(closeUpdate).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it("locks a clean workspace and emits close.period.locked with the pack snapshot", async () => {
    closeFindUnique.mockResolvedValue(closeRow({ state: "open" }))
    gateFindMany.mockResolvedValue([])
    workspaceFindUnique.mockResolvedValue({ jurisdictionCode: "ZA" })
    closeUpdate.mockResolvedValue(closeRow({ state: "locked", lockedById: "u1" }))
    await lockClose({ closeId: "c1", actorId: "u1" })
    const upd = closeUpdate.mock.calls[0][0]
    expect(upd.data.state).toBe("locked")
    expect(upd.data.packCode).toBe("ZA")
    expect(upd.data.packVersion).toBe("za-v1-2026-09")
    expect(upd.data.lockSnapshot).toMatchObject({ packCode: "ZA", packVersion: "za-v1-2026-09" })
    const event = auditCreate.mock.calls[0][0].data
    expect(event.type).toBe("close.period.locked")
    expect(event.payload).toMatchObject({ packCode: "ZA", packVersion: "za-v1-2026-09" })
  })

  it("firm mode: snapshot carries workspaceModeAtLock='firm' + reviewerOfRecord = lock actor (#79)", async () => {
    closeFindUnique.mockResolvedValue(closeRow({ state: "open" }))
    gateFindMany.mockResolvedValue([])
    workspaceFindUnique.mockResolvedValue({ jurisdictionCode: "ZA" })
    workspaceMemberCount.mockResolvedValue(2) // ≥1 reviewer -> firm
    workspaceMemberFindFirst.mockResolvedValue({ user: { id: "u1", name: "Ann Reviewer" } })
    closeUpdate.mockResolvedValue(closeRow({ state: "locked", lockedById: "u1" }))
    await lockClose({ closeId: "c1", actorId: "u1" })
    const snap = closeUpdate.mock.calls[0][0].data.lockSnapshot
    expect(snap.workspaceModeAtLock).toBe("firm")
    expect(snap.reviewerOfRecord).toEqual({ userId: "u1", name: "Ann Reviewer" })
    const event = auditCreate.mock.calls[0][0].data
    expect(event.payload.workspaceModeAtLock).toBe("firm")
    expect(event.payload.reviewerOfRecord).toEqual({ userId: "u1", name: "Ann Reviewer" })
  })

  it("SMB mode: snapshot carries workspaceModeAtLock='smb' + reviewerOfRecord=null; no member lookup (#79)", async () => {
    closeFindUnique.mockResolvedValue(closeRow({ state: "open" }))
    gateFindMany.mockResolvedValue([])
    workspaceFindUnique.mockResolvedValue({ jurisdictionCode: "ZA" })
    workspaceMemberCount.mockResolvedValue(0) // no reviewers -> smb
    closeUpdate.mockResolvedValue(closeRow({ state: "locked", lockedById: "u1" }))
    await lockClose({ closeId: "c1", actorId: "u1" })
    const snap = closeUpdate.mock.calls[0][0].data.lockSnapshot
    expect(snap.workspaceModeAtLock).toBe("smb")
    expect(snap.reviewerOfRecord).toBeNull()
    expect(workspaceMemberFindFirst).not.toHaveBeenCalled()
  })

  it("firm mode with a non-signing actor throws CloseLockRequiresReviewerActorError — snapshot needs a reviewer of record (#79)", async () => {
    closeFindUnique.mockResolvedValue(closeRow({ state: "open" }))
    gateFindMany.mockResolvedValue([])
    workspaceFindUnique.mockResolvedValue({ jurisdictionCode: "ZA" })
    workspaceMemberCount.mockResolvedValue(1)
    workspaceMemberFindFirst.mockResolvedValue(null) // actor isn't reviewer/owner
    await expect(lockClose({ closeId: "c1", actorId: "u1" })).rejects.toBeInstanceOf(CloseLockRequiresReviewerActorError)
    expect(closeUpdate).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it("carries a null user.name through as null in the snapshot rather than dropping the row (#79)", async () => {
    closeFindUnique.mockResolvedValue(closeRow({ state: "open" }))
    gateFindMany.mockResolvedValue([])
    workspaceFindUnique.mockResolvedValue({ jurisdictionCode: "ZA" })
    workspaceMemberCount.mockResolvedValue(1)
    workspaceMemberFindFirst.mockResolvedValue({ user: { id: "u1", name: null } })
    closeUpdate.mockResolvedValue(closeRow({ state: "locked", lockedById: "u1" }))
    await lockClose({ closeId: "c1", actorId: "u1" })
    const snap = closeUpdate.mock.calls[0][0].data.lockSnapshot
    expect(snap.reviewerOfRecord).toEqual({ userId: "u1", name: null })
  })

  it("throws CloseNotFoundError for a missing id, CloseWrongStateError for a locked one", async () => {
    closeFindUnique.mockResolvedValueOnce(null)
    await expect(lockClose({ closeId: "missing", actorId: "u1" })).rejects.toBeInstanceOf(CloseNotFoundError)

    closeFindUnique.mockResolvedValueOnce(closeRow({ state: "locked" }))
    await expect(lockClose({ closeId: "c1", actorId: "u1" })).rejects.toBeInstanceOf(CloseWrongStateError)
  })
})

describe("reopenClose", () => {
  it("flips locked → open, marks every item reSignRequired, and emits close.period.reopened", async () => {
    closeFindUnique.mockResolvedValue(closeRow({ state: "locked", lockedAt: new Date() }))
    closeUpdate.mockResolvedValue(closeRow({ state: "open", reopenReason: "AP adjustment" }))
    closeItemUpdateMany.mockResolvedValue({ count: 4 })
    await reopenClose({ closeId: "c1", actorId: "u1", reason: "AP adjustment" })
    expect(closeItemUpdateMany).toHaveBeenCalledWith({
      where: { closeId: "c1" },
      data: { reSignRequired: true },
    })
    const event = auditCreate.mock.calls[0][0].data
    expect(event.type).toBe("close.period.reopened")
    expect(event.payload.reason).toBe("AP adjustment")
  })

  it("requires a non-empty reason — reopen is 'explicit' per #42", async () => {
    closeFindUnique.mockResolvedValue(closeRow({ state: "locked" }))
    await expect(reopenClose({ closeId: "c1", actorId: "u1", reason: "   " })).rejects.toThrow(/reason is required/)
  })

  it("refuses to reopen an already-open close", async () => {
    closeFindUnique.mockResolvedValue(closeRow({ state: "open" }))
    await expect(reopenClose({ closeId: "c1", actorId: "u1", reason: "…" })).rejects.toBeInstanceOf(CloseWrongStateError)
  })
})

describe("relockClose", () => {
  it("emits close.period.relocked (not close.period.locked) so the trail keeps first-lock vs re-lock distinguishable", async () => {
    closeFindUnique.mockResolvedValue(closeRow({ state: "open", lastReopenedAt: new Date() }))
    gateFindMany.mockResolvedValue([])
    workspaceFindUnique.mockResolvedValue({ jurisdictionCode: "LS" })
    closeUpdate.mockResolvedValue(closeRow({ state: "locked" }))
    await relockClose({ closeId: "c1", actorId: "u1" })
    expect(auditCreate.mock.calls[0][0].data.type).toBe("close.period.relocked")
  })

  it("uses the same hard-gate guard as first lock", async () => {
    closeFindUnique.mockResolvedValue(closeRow({ state: "open", lastReopenedAt: new Date() }))
    gateFindMany.mockResolvedValue([{ id: "g1" }])
    await expect(relockClose({ closeId: "c1", actorId: "u1" })).rejects.toBeInstanceOf(CloseLockBlockedByGatesError)
  })
})

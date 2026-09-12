import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn(() => { throw new Error("no request scope") }),
}))

const closeItemFindUnique = vi.fn()
const closeItemUpdate = vi.fn()
const auditCreate = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    closeItem: { findUnique: closeItemFindUnique, update: closeItemUpdate },
    auditEvent: { create: auditCreate },
  },
}))

const {
  signCloseItem,
  unsignCloseItem,
  overrideCloseItem,
  recordBankAssertion,
  CloseItemNotFoundError,
  CloseItemParentLockedError,
  CloseItemWrongStateError,
  CloseItemOverrideReasonRequiredError,
  BankAssertionWrongKindError,
} = await import("./sign-off")

const itemRow = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  workspaceId: "w1",
  closeId: "c1",
  kind: "ap-aging",
  title: "AP aging + open-exception review",
  required: true,
  softDelta: false,
  state: "pending",
  reSignRequired: false,
  computedAt: null,
  computedValue: null,
  signedAt: null,
  signedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  close: {
    id: "c1",
    workspaceId: "w1",
    periodYear: 2026,
    periodMonth: 8,
    state: "open",
  },
  ...over,
})

beforeEach(() => {
  closeItemFindUnique.mockReset()
  closeItemUpdate.mockReset()
  auditCreate.mockReset()
  closeItemUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ ...itemRow(), ...args.data }))
})

describe("signCloseItem", () => {
  it("flips to signed, stamps signer, clears reSignRequired, emits close.item.signed", async () => {
    closeItemFindUnique.mockResolvedValue(itemRow({ reSignRequired: true }))
    await signCloseItem({ closeItemId: "i1", actorId: "u1" })
    const upd = closeItemUpdate.mock.calls[0][0]
    expect(upd.data.state).toBe("signed")
    expect(upd.data.signedById).toBe("u1")
    expect(upd.data.signedAt).toBeInstanceOf(Date)
    expect(upd.data.reSignRequired).toBe(false)
    const event = auditCreate.mock.calls[0][0].data
    expect(event.type).toBe("close.item.signed")
    expect(event.subjectType).toBe("close_item")
    expect(event.payload).toMatchObject({ closeId: "c1", kind: "ap-aging", periodYear: 2026, periodMonth: 8, reSign: true })
  })

  it("records reSign=false for a first sign", async () => {
    closeItemFindUnique.mockResolvedValue(itemRow())
    await signCloseItem({ closeItemId: "i1", actorId: "u1" })
    expect(auditCreate.mock.calls[0][0].data.payload.reSign).toBe(false)
  })

  it("refuses while the parent close is locked", async () => {
    closeItemFindUnique.mockResolvedValue(itemRow({ close: { ...itemRow().close, state: "locked" } }))
    await expect(signCloseItem({ closeItemId: "i1", actorId: "u1" })).rejects.toBeInstanceOf(CloseItemParentLockedError)
    expect(closeItemUpdate).not.toHaveBeenCalled()
  })

  it("throws CloseItemNotFoundError for a missing id", async () => {
    closeItemFindUnique.mockResolvedValue(null)
    await expect(signCloseItem({ closeItemId: "nope", actorId: "u1" })).rejects.toBeInstanceOf(CloseItemNotFoundError)
  })
})

describe("unsignCloseItem", () => {
  it("returns a signed item to pending, clearing signer fields, and emits close.item.unsigned", async () => {
    closeItemFindUnique.mockResolvedValue(itemRow({ state: "signed", signedAt: new Date(), signedById: "u1" }))
    await unsignCloseItem({ closeItemId: "i1", actorId: "u2" })
    const upd = closeItemUpdate.mock.calls[0][0]
    expect(upd.data).toMatchObject({ state: "pending", signedAt: null, signedById: null })
    const event = auditCreate.mock.calls[0][0].data
    expect(event.type).toBe("close.item.unsigned")
    expect(event.payload).toMatchObject({ priorState: "signed" })
  })

  it("refuses to unsign a pending item", async () => {
    closeItemFindUnique.mockResolvedValue(itemRow({ state: "pending" }))
    await expect(unsignCloseItem({ closeItemId: "i1", actorId: "u1" })).rejects.toBeInstanceOf(CloseItemWrongStateError)
  })

  it("refuses while the parent close is locked", async () => {
    closeItemFindUnique.mockResolvedValue(itemRow({ state: "signed", close: { ...itemRow().close, state: "locked" } }))
    await expect(unsignCloseItem({ closeItemId: "i1", actorId: "u1" })).rejects.toBeInstanceOf(CloseItemParentLockedError)
  })
})

describe("overrideCloseItem", () => {
  it("flips to override with the reason on the audit payload — the acknowledge path per #42", async () => {
    closeItemFindUnique.mockResolvedValue(itemRow({ reSignRequired: true }))
    await overrideCloseItem({ closeItemId: "i1", actorId: "u1", reason: "  Small residual accepted  " })
    const upd = closeItemUpdate.mock.calls[0][0]
    expect(upd.data.state).toBe("override")
    expect(upd.data.signedById).toBe("u1")
    expect(upd.data.reSignRequired).toBe(false)
    const event = auditCreate.mock.calls[0][0].data
    expect(event.type).toBe("close.item.override")
    expect(event.payload.reason).toBe("Small residual accepted")
  })

  it("requires a non-empty reason", async () => {
    await expect(overrideCloseItem({ closeItemId: "i1", actorId: "u1", reason: "   " })).rejects.toBeInstanceOf(
      CloseItemOverrideReasonRequiredError,
    )
    expect(closeItemFindUnique).not.toHaveBeenCalled()
  })

  it("refuses while the parent close is locked", async () => {
    closeItemFindUnique.mockResolvedValue(itemRow({ close: { ...itemRow().close, state: "locked" } }))
    await expect(overrideCloseItem({ closeItemId: "i1", actorId: "u1", reason: "r" })).rejects.toBeInstanceOf(
      CloseItemParentLockedError,
    )
  })
})

describe("recordBankAssertion", () => {
  const bankItem = (computedValue: unknown = null) =>
    itemRow({ kind: "bank-recon", softDelta: true, computedValue })

  it("with computedBalance null, an assertion flips status to within-tolerance (nothing to diff)", async () => {
    closeItemFindUnique.mockResolvedValue(
      bankItem({ kind: "bank-recon", status: "awaiting-assertion", assertedBalance: null, computedBalance: null, deltaAmount: null, tolerance: 1 }),
    )
    await recordBankAssertion({ closeItemId: "i1", actorId: "u1", assertedBalance: 1234.567 })
    const value = closeItemUpdate.mock.calls[0][0].data.computedValue
    expect(value).toMatchObject({ status: "within-tolerance", assertedBalance: 1234.57, computedBalance: null, deltaAmount: null })
    // Emits the same event kind as the compute layer — an assertion is a computed-value change.
    expect(auditCreate.mock.calls[0][0].data.type).toBe("close.item.computed")
  })

  it("diffs against a present computedBalance and flags a delta beyond tolerance", async () => {
    closeItemFindUnique.mockResolvedValue(
      bankItem({ kind: "bank-recon", status: "awaiting-assertion", assertedBalance: null, computedBalance: 1000, deltaAmount: null, tolerance: 1 }),
    )
    await recordBankAssertion({ closeItemId: "i1", actorId: "u1", assertedBalance: 1005 })
    expect(closeItemUpdate.mock.calls[0][0].data.computedValue).toMatchObject({ status: "delta-flagged", deltaAmount: 5 })
  })

  it("stays within tolerance for a small delta", async () => {
    closeItemFindUnique.mockResolvedValue(
      bankItem({ kind: "bank-recon", status: "awaiting-assertion", assertedBalance: null, computedBalance: 1000, deltaAmount: null, tolerance: 1 }),
    )
    await recordBankAssertion({ closeItemId: "i1", actorId: "u1", assertedBalance: 1000.5 })
    expect(closeItemUpdate.mock.calls[0][0].data.computedValue).toMatchObject({ status: "within-tolerance", deltaAmount: 0.5 })
  })

  it("builds a fresh shape with the default tolerance when computedValue is null", async () => {
    closeItemFindUnique.mockResolvedValue(bankItem(null))
    await recordBankAssertion({ closeItemId: "i1", actorId: "u1", assertedBalance: 10 })
    expect(closeItemUpdate.mock.calls[0][0].data.computedValue).toMatchObject({ tolerance: 1, assertedBalance: 10 })
  })

  it("refuses a non-bank-recon item and a locked parent", async () => {
    closeItemFindUnique.mockResolvedValueOnce(itemRow({ kind: "ap-aging" }))
    await expect(recordBankAssertion({ closeItemId: "i1", actorId: "u1", assertedBalance: 1 })).rejects.toBeInstanceOf(
      BankAssertionWrongKindError,
    )
    closeItemFindUnique.mockResolvedValueOnce(itemRow({ kind: "bank-recon", close: { ...itemRow().close, state: "locked" } }))
    await expect(recordBankAssertion({ closeItemId: "i1", actorId: "u1", assertedBalance: 1 })).rejects.toBeInstanceOf(
      CloseItemParentLockedError,
    )
  })

  it("rejects a non-finite balance", async () => {
    await expect(recordBankAssertion({ closeItemId: "i1", actorId: "u1", assertedBalance: Number.NaN })).rejects.toThrow(/finite/)
  })
})

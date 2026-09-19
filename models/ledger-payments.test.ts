import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

const { getDocumentPaymentStatuses } = await import("@/models/ledger-payments")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.integrationPush = { findMany: vi.fn().mockResolvedValue([]) }
  db.ledgerTransaction = { findMany: vi.fn().mockResolvedValue([]) }
})

describe("getDocumentPaymentStatuses", () => {
  it("returns the ledger's confirmed payment status when one exists", async () => {
    db.integrationPush.findMany.mockResolvedValue([
      { documentId: "d1", externalBillId: "eb1", connectionId: "c1", externalRecordKind: "bill", completedAt: new Date() },
    ])
    db.ledgerTransaction.findMany.mockResolvedValue([
      { connectionId: "c1", externalId: "eb1", kind: "bill", paymentStatus: "paid", dueAmount: null, paidAmount: 100, syncedAt: new Date("2026-09-10T00:00:00Z") },
    ])
    const result = await getDocumentPaymentStatuses("w1", ["d1"])
    expect(result.get("d1")?.paymentStatus).toBe("paid")
  })

  // #220: a succeeded push with no matching ledger row (or a ledger row with no confirmed
  // status) used to be left out of the map entirely — invisible to the UI. It now surfaces as
  // "posted" so a pushed-but-unconfirmed invoice isn't indistinguishable from one never pushed.
  it("surfaces a succeeded push with no confirmed ledger status as posted", async () => {
    db.integrationPush.findMany.mockResolvedValue([
      { documentId: "d1", externalBillId: "eb1", connectionId: "c1", externalRecordKind: "bill", completedAt: new Date("2026-09-14T00:00:00Z") },
    ])
    db.ledgerTransaction.findMany.mockResolvedValue([])
    const result = await getDocumentPaymentStatuses("w1", ["d1"])
    expect(result.get("d1")?.paymentStatus).toBe("posted")
    expect(result.get("d1")?.syncedAt).toEqual(new Date("2026-09-14T00:00:00Z"))
  })

  it("surfaces posted when the ledger row exists but has no computed payment status", async () => {
    db.integrationPush.findMany.mockResolvedValue([
      { documentId: "d1", externalBillId: "eb1", connectionId: "c1", externalRecordKind: "bill", completedAt: new Date() },
    ])
    db.ledgerTransaction.findMany.mockResolvedValue([
      { connectionId: "c1", externalId: "eb1", kind: "bill", paymentStatus: null, dueAmount: null, paidAmount: null, syncedAt: new Date("2026-09-12T00:00:00Z") },
    ])
    const result = await getDocumentPaymentStatuses("w1", ["d1"])
    expect(result.get("d1")?.paymentStatus).toBe("posted")
    // Prefers the ledger row's own syncedAt over the push's completedAt when a row exists.
    expect(result.get("d1")?.syncedAt).toEqual(new Date("2026-09-12T00:00:00Z"))
  })

  it("returns an empty map when no push has an external bill id", async () => {
    const result = await getDocumentPaymentStatuses("w1", ["d1"])
    expect(result.size).toBe(0)
  })
})

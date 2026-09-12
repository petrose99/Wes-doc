import { describe, expect, it, vi } from "vitest"

// next/headers throws outside a request scope in the real runtime (the job worker, scripts) —
// mocked here to do the same, so getRequestAuditContext's fallback path is exercised rather than
// a test-environment accident of next/headers just returning undefined.
vi.mock("next/headers", () => ({
  headers: vi.fn(() => { throw new Error("no request scope") }),
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    documentAuditEvent: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
  },
}))

const { auditEventData, getRequestAuditContext, recordDocumentAudit, recordSystemAudit, writeAuditEvent, AuditEventType } = await import("@/lib/audit")
const { prisma } = await import("@/lib/db")

describe("getRequestAuditContext", () => {
  it("returns all-null when there is no request scope, rather than throwing", async () => {
    await expect(getRequestAuditContext()).resolves.toEqual({ sourceIp: null, userAgent: null })
  })
})

describe("auditEventData", () => {
  it("defaults outcome to success and passes through the given context", () => {
    const data = auditEventData({ workspaceId: "w1", type: "document_viewed" }, { sourceIp: "1.2.3.4", userAgent: "curl" })
    expect(data).toEqual({
      workspaceId: "w1", documentId: null, actorId: null, type: "document_viewed",
      outcome: "success", detail: undefined, sourceIp: "1.2.3.4", userAgent: "curl",
    })
  })
})

describe("recordDocumentAudit", () => {
  it("writes with null sourceIp/userAgent when headers() throws", async () => {
    vi.mocked(prisma.documentAuditEvent.create).mockClear()
    await recordDocumentAudit({ workspaceId: "w1", type: "document_viewed", actorId: "u1" })
    expect(prisma.documentAuditEvent.create).toHaveBeenCalledWith({
      data: { workspaceId: "w1", documentId: null, actorId: "u1", type: "document_viewed", outcome: "success", detail: undefined, sourceIp: null, userAgent: null },
    })
  })

  it("never throws when the write itself fails — an audit failure must not break the caller", async () => {
    vi.mocked(prisma.documentAuditEvent.create).mockRejectedValueOnce(new Error("db down"))
    await expect(recordDocumentAudit({ workspaceId: "w1", type: "document_viewed" })).resolves.toBeUndefined()
  })
})

describe("recordSystemAudit", () => {
  it("always writes a null actorId and never calls headers()", async () => {
    vi.mocked(prisma.documentAuditEvent.create).mockClear()
    await recordSystemAudit({ workspaceId: "w1", documentId: "d1", type: "extraction_completed" })
    expect(prisma.documentAuditEvent.create).toHaveBeenCalledWith({
      data: { workspaceId: "w1", documentId: "d1", actorId: null, type: "extraction_completed", outcome: "success", detail: undefined, sourceIp: null, userAgent: null },
    })
  })
})

describe("AuditEventType", () => {
  it("covers both the gate family (#40) and the close family (#42) — 12 events total, no drift", () => {
    // If someone renames or deletes an event, this test is the tripwire — downstream #40/#42
    // tickets encode these strings directly and rely on them being stable.
    expect(new Set(Object.values(AuditEventType))).toEqual(new Set([
      "gate.blocked", "gate.overridden", "gate.resolved",
      "close.opened", "close.item.computed", "close.item.signed", "close.item.unsigned",
      "close.item.override", "close.item.attested", "close.period.locked", "close.period.reopened",
      "close.period.relocked",
    ]))
  })
})

describe("writeAuditEvent", () => {
  it("hashes the payload deterministically regardless of key order — the idempotency contract", async () => {
    // Two calls with the same fields in different order must produce the same payload_hash on
    // the row that's written; otherwise #42's "computed logged only on value change" is a lie.
    vi.mocked(prisma.auditEvent.create).mockClear()
    vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as never)
    await writeAuditEvent({
      workspaceId: "w1", actorId: "u1", type: AuditEventType.CLOSE_ITEM_COMPUTED,
      subjectType: "close_item", subjectId: "00000000-0000-0000-0000-000000000001",
      payload: { openingBalance: 100, closingBalance: 250, deltas: [1, 2, 3] },
    })
    await writeAuditEvent({
      workspaceId: "w1", actorId: "u1", type: AuditEventType.CLOSE_ITEM_COMPUTED,
      subjectType: "close_item", subjectId: "00000000-0000-0000-0000-000000000001",
      payload: { deltas: [1, 2, 3], closingBalance: 250, openingBalance: 100 },
    })
    const [firstCall, secondCall] = vi.mocked(prisma.auditEvent.create).mock.calls
    const first = (firstCall![0] as { data: { payloadHash: string } }).data
    const second = (secondCall![0] as { data: { payloadHash: string } }).data
    expect(first.payloadHash).toBe(second.payloadHash)
  })

  it("distinct write when the payload actually changes", async () => {
    vi.mocked(prisma.auditEvent.create).mockClear()
    vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as never)
    await writeAuditEvent({
      workspaceId: "w1", type: AuditEventType.CLOSE_ITEM_COMPUTED,
      subjectType: "close_item", subjectId: "00000000-0000-0000-0000-000000000001",
      payload: { balance: 100 },
    })
    await writeAuditEvent({
      workspaceId: "w1", type: AuditEventType.CLOSE_ITEM_COMPUTED,
      subjectType: "close_item", subjectId: "00000000-0000-0000-0000-000000000001",
      payload: { balance: 101 },
    })
    const [firstCall, secondCall] = vi.mocked(prisma.auditEvent.create).mock.calls
    const first = (firstCall![0] as { data: { payloadHash: string } }).data
    const second = (secondCall![0] as { data: { payloadHash: string } }).data
    expect(first.payloadHash).not.toBe(second.payloadHash)
  })

  it("allows a null actorId for system-emitted events (per #42: assistant auto-computes)", async () => {
    vi.mocked(prisma.auditEvent.create).mockClear()
    vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as never)
    await writeAuditEvent({
      workspaceId: "w1", type: AuditEventType.CLOSE_ITEM_COMPUTED,
      subjectType: "close_item", subjectId: "00000000-0000-0000-0000-000000000002",
      payload: { balance: 100 },
    })
    const [call] = vi.mocked(prisma.auditEvent.create).mock.calls
    expect((call![0] as { data: { actorId: string | null } }).data.actorId).toBeNull()
  })

  it("swallows a P2002 unique-violation silently — that's the idempotent path, not a failure", async () => {
    vi.mocked(prisma.auditEvent.create).mockClear()
    vi.mocked(prisma.auditEvent.create).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
    await expect(writeAuditEvent({
      workspaceId: "w1", type: AuditEventType.GATE_BLOCKED,
      subjectType: "bill", subjectId: "00000000-0000-0000-0000-000000000003",
      payload: { gateId: "duplicate" },
    })).resolves.toBeUndefined()
  })

  it("never throws when the write fails for any other reason — audit failure must not break the caller", async () => {
    vi.mocked(prisma.auditEvent.create).mockClear()
    vi.mocked(prisma.auditEvent.create).mockRejectedValueOnce(new Error("db down"))
    await expect(writeAuditEvent({
      workspaceId: "w1", type: AuditEventType.GATE_BLOCKED,
      subjectType: "bill", subjectId: "00000000-0000-0000-0000-000000000004",
    })).resolves.toBeUndefined()
  })
})

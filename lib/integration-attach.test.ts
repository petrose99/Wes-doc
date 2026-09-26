import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Same isolation shape as lib/integration-push.test.ts: DB + every provider dependency stubbed so
// attemptIntegrationAttachment's control flow is testable without a database or a network call.
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: {}, PrismaClient: vi.fn() }))
vi.mock("@/lib/config", () => ({ default: { app: { baseURL: "https://app.test" }, aws: { internalWorkerSecret: "s" } } }))
vi.mock("@/lib/audit", () => ({ recordSystemAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/integrations/quickbooks/client", () => ({
  listAttachments: vi.fn().mockResolvedValue([]),
  attachFile: vi.fn().mockResolvedValue({ attachmentId: "qb-att-1", fileName: "invoice.pdf" }),
}))
vi.mock("@/lib/integrations/xero/client", () => ({
  listAttachments: vi.fn().mockResolvedValue([]),
  attachFile: vi.fn().mockResolvedValue({ attachmentId: "xero-att-1", fileName: "invoice.pdf" }),
}))
vi.mock("@/lib/integration-attach-rendition", () => ({
  fixedAttachFilename: vi.fn((name: string) => name),
  loadAttachmentRendition: vi.fn().mockResolvedValue({ buffer: Buffer.from("pdf-bytes"), contentType: "application/pdf", fileName: "invoice.pdf" }),
}))

const { attemptIntegrationAttachment, enqueueAttachmentForPush } = await import("./integration-attach")
const { IntegrationAuthError, IntegrationPermanentError } = await import("./integrations/errors")
const db = (await import("@/lib/db")) as unknown as { prisma: Record<string, any> }
const quickbooks = (await import("./integrations/quickbooks/client")) as unknown as Record<string, any>
const xero = (await import("./integrations/xero/client")) as unknown as Record<string, any>
const rendition = (await import("./integration-attach-rendition")) as unknown as Record<string, any>

const now = new Date("2026-09-26T12:00:00.000Z")

function makeAttachment(overrides: Record<string, any> = {}) {
  return {
    id: "att-1",
    workspaceId: "w1",
    documentId: "d1",
    status: "pending",
    attempts: 0,
    fileName: "invoice.pdf",
    provider: "quickbooks",
    connection: { id: "conn-1", provider: "quickbooks", status: "connected", externalTenantId: "realm-1" },
    push: { status: "succeeded", externalBillId: "bill-1" },
    ...overrides,
  }
}

function makePrisma(attachment: any) {
  return {
    integrationAttachment: { findUnique: vi.fn().mockResolvedValue(attachment), update: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}) },
    integrationConnection: { update: vi.fn().mockResolvedValue({}) },
    integrationPush: { findUnique: vi.fn() },
    document: { findUnique: vi.fn().mockResolvedValue({ storageKey: "key", mimeType: "application/pdf", pageRange: null, filename: "invoice.pdf" }) },
  }
}

beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe("attemptIntegrationAttachment", () => {
  it("pauses a needs_reconnect connection without burning an attempt or the lease", async () => {
    const attachment = makeAttachment({ attempts: 2, connection: { ...makeAttachment().connection, status: "needs_reconnect" } })
    const prisma = makePrisma(attachment)
    db.prisma = prisma

    await attemptIntegrationAttachment("att-1", now)

    expect(prisma.integrationAttachment.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "att-1" },
      data: { leaseUntil: null, nextAttemptAt: new Date(now.getTime() + 5 * 60 * 1000) },
    })
  })

  it("fails terminally when the connection was deleted out from under the attach", async () => {
    const attachment = makeAttachment({ connection: null })
    const prisma = makePrisma(attachment)
    db.prisma = prisma

    await attemptIntegrationAttachment("att-1", now)

    const update = prisma.integrationAttachment.update.mock.calls[0][0]
    expect(update.data.status).toBe("failed")
    expect(update.data.errorCode).toBe("integration_connection_disabled")
  })

  it("succeeds without a second upload when listAttachments already shows the fixed filename", async () => {
    quickbooks.listAttachments.mockResolvedValueOnce([{ attachmentId: "qb-att-9", fileName: "invoice.pdf" }])
    const attachment = makeAttachment()
    const prisma = makePrisma(attachment)
    db.prisma = prisma

    await attemptIntegrationAttachment("att-1", now)

    expect(quickbooks.attachFile).not.toHaveBeenCalled()
    const update = prisma.integrationAttachment.update.mock.calls[0][0]
    expect(update.data.status).toBe("succeeded")
    expect(update.data.externalAttachmentId).toBe("qb-att-9")
  })

  it("uploads and succeeds when no matching filename exists yet", async () => {
    const attachment = makeAttachment()
    const prisma = makePrisma(attachment)
    db.prisma = prisma

    await attemptIntegrationAttachment("att-1", now)

    expect(quickbooks.attachFile).toHaveBeenCalledWith("realm-1", "conn-1", "bill-1", { buffer: Buffer.from("pdf-bytes"), contentType: "application/pdf", fileName: "invoice.pdf" })
    const update = prisma.integrationAttachment.update.mock.calls[0][0]
    expect(update.data.status).toBe("succeeded")
    expect(update.data.externalAttachmentId).toBe("qb-att-1")
  })

  it("on a mid-attempt IntegrationAuthError, flips the connection and pauses instead of burning an attempt", async () => {
    quickbooks.listAttachments.mockRejectedValueOnce(new IntegrationAuthError("revoked"))
    const attachment = makeAttachment()
    const prisma = makePrisma(attachment)
    db.prisma = prisma

    await attemptIntegrationAttachment("att-1", now)

    expect(prisma.integrationConnection.update).toHaveBeenCalledWith({ where: { id: "conn-1" }, data: { status: "needs_reconnect" } })
    const update = prisma.integrationAttachment.update.mock.calls[0][0]
    expect(update.data.leaseUntil).toBeNull()
    expect(update.data.status).toBeUndefined()
  })

  it("fails terminally on Xero's over-count ceiling (10 existing attachments) without ever uploading", async () => {
    const existing = Array.from({ length: 10 }, (_, i) => ({ attachmentId: `x${i}`, fileName: `other-${i}.pdf` }))
    xero.listAttachments.mockResolvedValueOnce(existing)
    const attachment = makeAttachment({ provider: "xero", connection: { id: "conn-2", provider: "xero", status: "connected", externalTenantId: "tenant-1" } })
    const prisma = makePrisma(attachment)
    db.prisma = prisma

    await attemptIntegrationAttachment("att-1", now)

    expect(xero.attachFile).not.toHaveBeenCalled()
    const update = prisma.integrationAttachment.update.mock.calls[0][0]
    expect(update.data.status).toBe("failed")
    expect(update.data.errorCode).toBe("attach_over_count")
  })

  it("fails terminally when the file violates the size/type table, without ever calling the provider upload", async () => {
    rendition.loadAttachmentRendition.mockResolvedValueOnce({ buffer: Buffer.alloc(200 * 1024 * 1024), contentType: "application/pdf", fileName: "invoice.pdf" })
    const attachment = makeAttachment()
    const prisma = makePrisma(attachment)
    db.prisma = prisma

    await attemptIntegrationAttachment("att-1", now)

    expect(quickbooks.attachFile).not.toHaveBeenCalled()
    const update = prisma.integrationAttachment.update.mock.calls[0][0]
    expect(update.data.status).toBe("failed")
    expect(update.data.errorCode).toBe("attach_oversize")
  })

  it("waits retryably when the attach's push has not actually succeeded yet", async () => {
    const attachment = makeAttachment({ push: { status: "pending", externalBillId: null } })
    const prisma = makePrisma(attachment)
    db.prisma = prisma

    await attemptIntegrationAttachment("att-1", now)

    expect(quickbooks.listAttachments).not.toHaveBeenCalled()
    const update = prisma.integrationAttachment.update.mock.calls[0][0]
    expect(update.data.status).toBe("pending")
    expect(update.data.errorCode).toBe("attach_push_not_succeeded")
  })
})

describe("enqueueAttachmentForPush", () => {
  it("creates one row with the fixed filename computed once", async () => {
    const prisma = {
      integrationPush: { findUnique: vi.fn().mockResolvedValue({ id: "push-1", workspaceId: "w1", documentId: "d1", connectionId: "conn-1", provider: "quickbooks", createdById: "u1" }) },
      document: { findUnique: vi.fn().mockResolvedValue({ filename: "Weird<Name>.pdf" }) },
      integrationAttachment: { create: vi.fn().mockResolvedValue({}) },
    }
    db.prisma = prisma
    rendition.fixedAttachFilename.mockReturnValueOnce("WeirdName.pdf")

    await enqueueAttachmentForPush("push-1")

    expect(prisma.integrationAttachment.create).toHaveBeenCalledWith({
      data: { workspaceId: "w1", pushId: "push-1", connectionId: "conn-1", documentId: "d1", provider: "quickbooks", fileName: "WeirdName.pdf", createdById: "u1" },
    })
  })

  it("silently skips a duplicate enqueue (P2002, already attached for this push)", async () => {
    const prisma = {
      integrationPush: { findUnique: vi.fn().mockResolvedValue({ id: "push-1", workspaceId: "w1", documentId: "d1", connectionId: "conn-1", provider: "quickbooks", createdById: null }) },
      document: { findUnique: vi.fn().mockResolvedValue({ filename: "invoice.pdf" }) },
      integrationAttachment: { create: vi.fn().mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" })) },
    }
    db.prisma = prisma

    await expect(enqueueAttachmentForPush("push-1")).resolves.toBeUndefined()
  })
})

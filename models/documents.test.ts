import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: {}, PrismaClient: vi.fn() }))
vi.mock("@/models/workspaces", () => ({ consumeWorkspaceQuota: vi.fn() }))
vi.mock("@/lib/document-storage", () => ({ documentStorageKey: vi.fn(), documentBlocksKey: vi.fn((ws: string, id: string) => `workspaces/${ws}/documents/${id}/blocks`), putDocumentSource: vi.fn(), deleteDocumentSource: vi.fn() }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))
vi.mock("@/models/document-field-values", () => ({ replaceDocumentFieldValues: vi.fn() }))
vi.mock("@/models/field-corrections", () => ({ recordFieldCorrection: vi.fn().mockResolvedValue(undefined) }))

const { createDocumentFromBuffer, deleteWorkspaceDocuments, documentDataForExport, documentHash, documentSourceFor, isSupportedDocumentBuffer, listReadyToPushDocuments, setDocumentPaymentStatus, stageWhereClause, updateDocumentField, validateDocumentInput } = await import("@/models/documents")
const { prisma } = await import("@/lib/db")
const { deleteDocumentSource } = await import("@/lib/document-storage")
const { recordFieldCorrection } = await import("@/models/field-corrections")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

describe("documentSourceFor", () => {
  // Regression: dictations were being stored with source "upload" (the value every caller passes),
  // so Document.source was never "dictation", so their chunks were tagged vlm_ocr — a dictated
  // snippet was cited as though it had been read off a printed page.
  it("records any audio upload as a dictation, whatever the caller passed", () => {
    for (const mime of ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/flac"]) {
      expect(documentSourceFor(mime, "upload")).toBe("dictation")
    }
  })

  it("leaves every non-audio type on the caller's source", () => {
    for (const mime of ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(documentSourceFor(mime, "upload")).toBe("upload")
    }
  })
})

describe("document input validation", () => {
  it("requires matching MIME magic bytes", () => {
    const pdf = Buffer.from("%PDF-1.7\n")
    expect(isSupportedDocumentBuffer(pdf, "application/pdf")).toBe(true)
    expect(isSupportedDocumentBuffer(Buffer.from("not a PDF"), "application/pdf")).toBe(false)
    expect(() => validateDocumentInput(Buffer.from("not a PDF"), "application/pdf")).toThrow("unsupported_document_type")
  })

  it("accepts PNG signatures only for PNG uploads", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    expect(isSupportedDocumentBuffer(png, "image/png")).toBe(true)
    expect(isSupportedDocumentBuffer(png, "image/jpeg")).toBe(false)
  })

  it("accepts JPEG signatures", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
    expect(isSupportedDocumentBuffer(jpeg, "image/jpeg")).toBe(true)
    expect(isSupportedDocumentBuffer(jpeg, "image/png")).toBe(false)
  })

  it("accepts WebP signatures", () => {
    const webp = Buffer.alloc(16)
    webp.write("RIFF", 0)
    webp.write("WEBP", 8)
    expect(isSupportedDocumentBuffer(webp, "image/webp")).toBe(true)
    expect(isSupportedDocumentBuffer(webp, "application/pdf")).toBe(false)
  })

  it("accepts HEIC via ftyp box", () => {
    const heic = Buffer.alloc(16)
    heic.write("ftyp", 4)
    expect(isSupportedDocumentBuffer(heic, "image/heic")).toBe(true)
  })

  it("rejects unsupported MIME types regardless of content", () => {
    const pdf = Buffer.from("%PDF-1.7\n")
    expect(isSupportedDocumentBuffer(pdf, "text/plain")).toBe(false)
    expect(isSupportedDocumentBuffer(pdf, "application/zip")).toBe(false)
  })

  it("rejects empty buffers", () => {
    expect(() => validateDocumentInput(Buffer.alloc(0), "application/pdf")).toThrow("invalid_document_size")
  })

  it("rejects buffers exceeding size limit", () => {
    const oversized = Buffer.alloc(51 * 1024 * 1024)
    oversized.write("%PDF-")
    expect(() => validateDocumentInput(oversized, "application/pdf")).toThrow("invalid_document_size")
  })
})

/** The file layer moved dedup from (workspaceId, sha256) to (fileId, sha256), so the same PDF
 * can be extracted into two different files with two different column sets. These lock in that
 * the lookup is keyed on the file — a regression here would silently return the *other* file's
 * document as a duplicate instead of extracting into this one. */
describe("createDocumentFromBuffer deduplication", () => {
  const db = prisma as unknown as Record<string, never>
  const pdf = Buffer.from("%PDF-1.7\nhello")
  let findUnique: ReturnType<typeof vi.fn>
  let templateFindFirst: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    findUnique = vi.fn().mockResolvedValue(null)
    templateFindFirst = vi.fn().mockResolvedValue({ id: "tpl-1", versions: [{ id: "ver-1", fields: [] }] })
    Object.assign(db, {
      documentTemplate: { findFirst: templateFindFirst },
      document: { findUnique, create: vi.fn(async ({ data }: { data: unknown }) => data), aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }) },
      documentProcessingJob: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "job-1" }) },
      documentAuditEvent: { create: vi.fn() },
      // No subscribed endpoints → emitWorkspaceEvent queues nothing and never kicks the drain.
      webhookEndpoint: { findMany: vi.fn().mockResolvedValue([]) },
      webhookDelivery: { createMany: vi.fn() },
      $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(db)),
    })
  })

  const input = { workspaceId: "w", fileId: "file-a", templateId: "tpl-1", source: "upload" as const, filename: "invoice.pdf", mimeType: "application/pdf", buffer: pdf }

  it("looks the existing document up by file, not by workspace", async () => {
    await createDocumentFromBuffer(input)
    expect(findUnique).toHaveBeenCalledWith({ where: { fileId_sha256: { fileId: "file-a", sha256: documentHash(pdf) } } })
  })

  it("treats the same bytes in a different file as a fresh document", async () => {
    findUnique.mockImplementation(async ({ where }: { where: { fileId_sha256: { fileId: string } } }) =>
      (where.fileId_sha256.fileId === "file-a" ? { id: "doc-1" } : null))

    await expect(createDocumentFromBuffer(input)).resolves.toMatchObject({ duplicate: true })
    await expect(createDocumentFromBuffer({ ...input, fileId: "file-b" })).resolves.toMatchObject({ duplicate: false })
  })

  it("refuses a new document that would push the workspace past the free-trial 200 MB cap", async () => {
    // 199 MB already stored — the 14-byte PDF fits comfortably, so the first call must succeed.
    db.document.aggregate = vi.fn().mockResolvedValue({ _sum: { sizeBytes: 199 * 1024 * 1024 } })
    await expect(createDocumentFromBuffer(input)).resolves.toMatchObject({ duplicate: false })

    // 200 MB - 5 bytes already stored — a 14-byte PDF would tip over the cap.
    db.document.aggregate = vi.fn().mockResolvedValue({ _sum: { sizeBytes: 200 * 1024 * 1024 - 5 } })
    findUnique.mockResolvedValue(null)
    await expect(createDocumentFromBuffer(input)).rejects.toThrow("free_trial_storage_exceeded")
  })

  it("does not spend against the free-trial cap when the document is a duplicate", async () => {
    // The cap is fully spent, but this file is already stored — the dedup path returns without ever
    // consulting the aggregate, so a re-upload of an existing document is not blocked.
    findUnique.mockResolvedValue({ id: "doc-1" })
    const aggregate = vi.fn().mockResolvedValue({ _sum: { sizeBytes: 200 * 1024 * 1024 } })
    db.document.aggregate = aggregate
    await expect(createDocumentFromBuffer(input)).resolves.toMatchObject({ duplicate: true })
    expect(aggregate).not.toHaveBeenCalled()
  })

  it("refuses a template that belongs to another file", async () => {
    templateFindFirst.mockResolvedValue(null)
    await expect(createDocumentFromBuffer(input)).rejects.toThrow("document_template_not_found")
    expect(templateFindFirst.mock.calls[0][0].where).toMatchObject({ id: "tpl-1", workspaceId: "w", fileId: "file-a" })
  })
})

describe("deleteWorkspaceDocuments", () => {
  const db = prisma as unknown as Record<string, never>
  let findMany: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(deleteDocumentSource).mockResolvedValue(undefined)
    findMany = vi.fn()
    Object.assign(db, {
      document: { findMany, delete: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      documentAuditEvent: { create: vi.fn() },
      // No subscribed endpoints → emitWorkspaceEvent queues nothing and never kicks the drain.
      webhookEndpoint: { findMany: vi.fn().mockResolvedValue([]) },
      webhookDelivery: { createMany: vi.fn() },
      // Interactive form now (deleteWorkspaceDocuments fans out document.deleted in the delete tx).
      $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(db)),
    })
  })

  it("removes the stored source and the row, and audits the deletion", async () => {
    findMany.mockResolvedValue([{ id: "doc-1", storageKey: "workspaces/w/documents/doc-1/source" }])

    await expect(deleteWorkspaceDocuments("w", ["doc-1"], "user-1")).resolves.toEqual({ deleted: 1 })
    expect(deleteDocumentSource).toHaveBeenCalledWith("workspaces/w/documents/doc-1/source")
    expect(db.documentAuditEvent.create).toHaveBeenCalledWith({
      data: { workspaceId: "w", actorId: "user-1", type: "document_deleted", documentId: null, outcome: "success", detail: undefined, sourceIp: null, userAgent: null },
    })
  })

  it("still deletes the row when the stored file is already gone", async () => {
    findMany.mockResolvedValue([{ id: "doc-1", storageKey: "missing/source" }])
    vi.mocked(deleteDocumentSource).mockRejectedValueOnce(new Error("ENOENT"))

    await expect(deleteWorkspaceDocuments("w", ["doc-1"], "user-1")).resolves.toEqual({ deleted: 1 })
    expect(db.document.delete).toHaveBeenCalledWith({ where: { id: "doc-1" } })
  })

  it("skips the source but still clears the blocks sidecar when there is no stored source", async () => {
    findMany.mockResolvedValue([{ id: "doc-1", storageKey: null }])

    await expect(deleteWorkspaceDocuments("w", ["doc-1"], "user-1")).resolves.toEqual({ deleted: 1 })
    // No source to delete, but the sidecar under the same prefix is cleared unconditionally.
    expect(deleteDocumentSource).toHaveBeenCalledTimes(1)
    expect(deleteDocumentSource).toHaveBeenCalledWith("workspaces/w/documents/doc-1/blocks")
  })

  it("caps a single call at 100 documents", async () => {
    findMany.mockResolvedValue([])
    const ids = Array.from({ length: 150 }, (_, index) => `doc-${index}`)

    await deleteWorkspaceDocuments("w", ids, "user-1")
    expect(findMany.mock.calls[0][0].where.id.in).toHaveLength(100)
  })
})

describe("updateDocumentField field-correction recording", () => {
  const fieldSnapshot = [{ key: "vendor", label: "Supplier", type: "string", required: true }]

  beforeEach(() => {
    vi.clearAllMocks()
    db.document = {
      findFirst: vi.fn().mockResolvedValue({
        id: "d1", workspaceId: "w1", status: "reviewed", fieldSnapshot, reviewedData: { vendor: "Acme In" }, rawExtraction: null,
        confidence: {}, provenance: null, fileId: "f1", template: { code: "invoice" },
      }),
      update: vi.fn().mockResolvedValue({ id: "d1" }),
    }
    db.documentAuditEvent = { create: vi.fn() }
    db.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(db))
  })

  it("records a correction when the new value actually differs", async () => {
    await updateDocumentField({ workspaceId: "w1", documentId: "d1", fieldKey: "vendor", value: "Acme Inc", actorId: "u1" })
    expect(vi.mocked(recordFieldCorrection)).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "w1", templateCode: "invoice", fieldKey: "vendor", wrongValue: "Acme In", correctedValue: "Acme Inc",
    }))
  })

  it("does not record a correction when the value is unchanged", async () => {
    await updateDocumentField({ workspaceId: "w1", documentId: "d1", fieldKey: "vendor", value: "Acme In", actorId: "u1" })
    expect(vi.mocked(recordFieldCorrection)).not.toHaveBeenCalled()
  })
})

describe("document hashing", () => {
  it("produces consistent SHA-256 hex digests", () => {
    const hash = documentHash(Buffer.from("hello"))
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(documentHash(Buffer.from("hello"))).toBe(hash)
    expect(documentHash(Buffer.from("world"))).not.toBe(hash)
  })
})

describe("documentDataForExport", () => {
  it("flattens reviewed data into the export row", () => {
    const row = documentDataForExport({
      filename: "invoice.pdf",
      status: "reviewed",
      receivedAt: new Date("2026-08-01T00:00:00Z"),
      reviewedData: { vendor: "Acme", total: 100 },
    })
    expect(row).toEqual({
      filename: "invoice.pdf",
      status: "reviewed",
      received_at: "2026-08-01T00:00:00.000Z",
      vendor: "Acme",
      total: 100,
    })
  })

  it("handles null reviewedData", () => {
    const row = documentDataForExport({
      filename: "doc.pdf",
      status: "queued",
      receivedAt: new Date("2026-08-01T00:00:00Z"),
      reviewedData: null as unknown as Record<string, unknown>,
    })
    expect(row.filename).toBe("doc.pdf")
  })
})

describe("setDocumentPaymentStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.document = { findFirst: vi.fn(), update: vi.fn().mockReturnValue("update") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }
    db.$transaction = vi.fn(async (operations: unknown[]) => operations)
  })

  it("refuses a document outside the workspace", async () => {
    db.document.findFirst.mockResolvedValue(null)
    await expect(setDocumentPaymentStatus({ workspaceId: "w1", documentId: "d1", status: "paid", actorId: "u1" })).rejects.toThrow("document_not_found")
  })

  it("stamps who confirmed it and when", async () => {
    db.document.findFirst.mockResolvedValue({ id: "d1", paymentStatus: null })
    await setDocumentPaymentStatus({ workspaceId: "w1", documentId: "d1", status: "paid", actorId: "u1" })
    expect(db.document.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { paymentStatus: "paid", paymentConfirmedAt: expect.any(Date), paymentConfirmedById: "u1" },
    })
  })

  it("is overwritable — a later correction replaces the earlier answer, not just the first one", async () => {
    db.document.findFirst.mockResolvedValue({ id: "d1", paymentStatus: "unpaid" })
    await setDocumentPaymentStatus({ workspaceId: "w1", documentId: "d1", status: "paid", actorId: "u1" })
    expect(db.document.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "paid" }) }))
    expect(db.documentAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ detail: { from: "unpaid", to: "paid" } }),
    }))
  })
})

// #249: a document approved but missing a usable total used to vanish from this list with no
// trace, so `droppedCount` needs to actually reflect it (see accounting-dashboard.tsx's hint).
describe("listReadyToPushDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.document = { findMany: vi.fn().mockResolvedValue([]) }
    db.integrationPush = { findMany: vi.fn().mockResolvedValue([]) }
  })

  it("returns an empty, undropped page when there are no approved documents", async () => {
    const result = await listReadyToPushDocuments("w1", "conn1")
    expect(result).toEqual({ documents: [], droppedCount: 0 })
  })

  it("lists a pushable, totalled document and carries its docType", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", docType: "invoice", template: { code: "invoice" }, reviewedData: { vendor: "Acme", total: 100, currency_code: "USD" }, rawExtraction: null, codingData: null },
    ])
    const { documents, droppedCount } = await listReadyToPushDocuments("w1", "conn1")
    expect(documents).toEqual([{ id: "d1", filename: "a.pdf", vendorName: "Acme", total: 100, currencyCode: "USD", category: "Uncategorized", docType: "invoice" }])
    expect(droppedCount).toBe(0)
  })

  it("counts (rather than silently swallowing) an approved document with no usable total", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", docType: "invoice", template: { code: "invoice" }, reviewedData: { vendor: "Acme" }, rawExtraction: null, codingData: null },
    ])
    const { documents, droppedCount } = await listReadyToPushDocuments("w1", "conn1")
    expect(documents).toEqual([])
    expect(droppedCount).toBe(1)
  })

  it("excludes a document already succeeded on this connection without counting it as dropped", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", docType: "invoice", template: { code: "invoice" }, reviewedData: { vendor: "Acme", total: 100 }, rawExtraction: null, codingData: null },
    ])
    db.integrationPush.findMany.mockResolvedValue([{ id: "p1", connectionId: "conn1", documentId: "d1", provider: "xero", status: "succeeded", attempts: 1, externalBillId: null, externalRecordKind: null, errorCode: null, createdAt: new Date(), completedAt: new Date() }])
    const { documents, droppedCount } = await listReadyToPushDocuments("w1", "conn1")
    expect(documents).toEqual([])
    expect(droppedCount).toBe(0)
  })

  it("excludes a non-pushable doc type without counting it as dropped", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", docType: "purchase_order", template: { code: "purchase_order" }, reviewedData: { total: 100 }, rawExtraction: null, codingData: null },
    ])
    const { documents, droppedCount } = await listReadyToPushDocuments("w1", "conn1")
    expect(documents).toEqual([])
    expect(droppedCount).toBe(0)
  })
})

describe("stageWhereClause null-safety regression", () => {
  // Regression: the original stageWhereClause used NOT: [{ paymentStatus: "paid" }, ...], which
  // is NULL-unsafe (SQL: NOT (col = 'paid') is NULL for NULL rows) — every reviewed document
  // whose paymentStatus was still null (the common case) silently disappeared from Approved,
  // Review, and Synced. Live DB check on the seeded workspace confirmed 7 reviewed docs with
  // NULL paymentStatus landing in 0 stages until this was rewritten to OR-with-null.
  it("uses OR-with-null for the not-paid predicate on Approved", () => {
    const clause = stageWhereClause("approved") as Record<string, unknown>
    const and = clause.AND as Array<Record<string, unknown>>
    expect(Array.isArray(and)).toBe(true)
    const notPaid = and.find((c) => Array.isArray(c.OR))
    expect(notPaid).toBeDefined()
    const or = notPaid?.OR as Array<Record<string, unknown>>
    expect(or.some((c) => c.paymentStatus === null)).toBe(true)
    expect(or.some((c) => JSON.stringify(c.paymentStatus) === '{"not":"paid"}')).toBe(true)
  })

  it("uses OR-with-null on Review too", () => {
    const clause = stageWhereClause("review") as Record<string, unknown>
    const and = clause.AND as Array<Record<string, unknown>>
    const notPaid = and.find((c) => Array.isArray(c.OR))
    expect(notPaid).toBeDefined()
    const or = notPaid?.OR as Array<Record<string, unknown>>
    expect(or.some((c) => c.paymentStatus === null)).toBe(true)
  })
})

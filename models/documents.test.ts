import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: {}, PrismaClient: vi.fn() }))
vi.mock("@/models/workspaces", () => ({ consumeWorkspaceQuota: vi.fn() }))
vi.mock("@/lib/document-storage", () => ({ documentStorageKey: vi.fn(), documentBlocksKey: vi.fn((ws: string, id: string) => `workspaces/${ws}/documents/${id}/blocks`), putDocumentSource: vi.fn(), deleteDocumentSource: vi.fn() }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))
vi.mock("@/models/document-field-values", () => ({ replaceDocumentFieldValues: vi.fn() }))
vi.mock("@/models/field-corrections", () => ({ recordFieldCorrection: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/models/document-checks", () => ({ refreshLineCodingChecks: vi.fn() }))
vi.mock("@/lib/fx/apply-to-document", () => ({ applyFxToDocument: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/automation/autopublish", () => ({ syncOnApproval: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/models/integrations", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, getCategoryAccountMap: vi.fn().mockResolvedValue({}) }
})
vi.mock("@/models/category-account-mappings", () => ({ listCategoryAccountMappings: vi.fn().mockResolvedValue([]), resolveCategoryAccount: vi.fn((_m: unknown, _c: unknown, _i: unknown, def: string) => def) }))
// #429: getBillAccountPickerData reads accounts through listAccountingEntities, which wraps
// prisma.accountingEntity.findMany in React's cache() — outside a render that memoizes across
// unrelated test cases with the same args, so it's mocked directly rather than through db.*.
vi.mock("@/models/accounting-entities", () => ({ listAccountingEntities: vi.fn() }))
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<{ default: Record<string, unknown> }>()
  return { default: { ...actual.default, integrations: { ...(actual.default.integrations as object), enabled: true } } }
})

const { createDocumentFromBuffer, deleteWorkspaceDocuments, dismissAccountCorrectionForDocuments, documentDataForExport, documentHash, documentSourceFor, findAccountCorrectionReminders, findBillsAffectedByAccountChange, getBillAccountPickerData, isSupportedDocumentBuffer, listReadyToPushDocuments, recordAccountCorrectionApplied, resolveDocumentCodingItems, setDocumentLineToAccount, setDocumentPaymentStatus, stageWhereClause, updateDocumentField, updateDocumentReview, validateDocumentInput } = await import("@/models/documents")
const { prisma } = await import("@/lib/db")
const { deleteDocumentSource } = await import("@/lib/document-storage")
const { recordFieldCorrection } = await import("@/models/field-corrections")
const { listAccountingEntities } = await import("@/models/accounting-entities")
const { refreshLineCodingChecks } = await import("@/models/document-checks")

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

describe("updateDocumentReview line-coding Checks (ADR 0014)", () => {
  it("re-judges the document's coding against the ledger after Save review commits", async () => {
    vi.clearAllMocks()
    const order: string[] = []
    db.document = {
      findFirst: vi.fn().mockResolvedValue({
        id: "d1", workspaceId: "w1", status: "needs_review", fieldSnapshot: [{ key: "vendor", label: "Supplier", type: "string", required: true }],
        reviewedData: null, rawExtraction: { vendor: "Acme" }, codingData: { documentType: "expense" }, codingSource: null, receivedAt: new Date(),
        confidence: {}, provenance: null, fileId: "f1", filename: "a.pdf", template: { code: "invoice" },
      }),
      update: vi.fn(async () => { order.push("review committed"); return { id: "d1", filename: "a.pdf", status: "reviewed", receivedAt: new Date(), reviewedData: { vendor: "Acme" }, confidence: {} } }),
    }
    db.documentAuditEvent = { create: vi.fn() }
    db.webhookEndpoint = { findMany: vi.fn().mockResolvedValue([]) }
    db.webhookDelivery = { createMany: vi.fn() }
    db.integrationConnection = { findFirst: vi.fn().mockResolvedValue(null) }
    db.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(db))
    vi.mocked(refreshLineCodingChecks).mockImplementation(async () => { order.push("refreshed") })
    await updateDocumentReview({ workspaceId: "w1", documentId: "d1", reviewedData: { vendor: "Acme" }, actorId: "u1" })
    expect(refreshLineCodingChecks).toHaveBeenCalledWith("w1", "d1")
    expect(order).toEqual(["review committed", "refreshed"])
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

// #430: correcting posted bills' Accounts — the affected-bills query, "Leave them", and the
// codingData rewrite after a provider write succeeds.
describe("findBillsAffectedByAccountChange", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.document = { findMany: vi.fn().mockResolvedValue([]) }
    db.integrationPush = { findMany: vi.fn().mockResolvedValue([]) }
  })

  it("is a no-op when nothing matches the old account (0 affected)", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", receivedAt: new Date("2026-01-01"), reviewedData: { vendor: "Acme" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-other" }] }, paymentStatus: null, baseCurrencyTotal: null, accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
    ])
    db.integrationPush.findMany.mockResolvedValue([{ id: "p1", connectionId: "conn1", documentId: "d1", status: "succeeded" }])
    const affected = await findBillsAffectedByAccountChange("w1", "conn1", "acc-old")
    expect(affected).toEqual([])
  })

  it("finds a posted bill whose codingData.items still carries the old account, with its line indexes", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", receivedAt: new Date("2026-01-01"), reviewedData: { vendor: "Acme Fuels", total: 1240 }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-old" }, { account_external_id: "acc-other" }] }, paymentStatus: null, baseCurrencyTotal: null, accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
    ])
    db.integrationPush.findMany.mockResolvedValue([{ id: "p1", connectionId: "conn1", documentId: "d1", status: "succeeded", externalBillId: "qb-1" }])
    const affected = await findBillsAffectedByAccountChange("w1", "conn1", "acc-old")
    expect(affected).toEqual([{ id: "d1", filename: "a.pdf", vendorName: "Acme Fuels", total: 1240, currencyCode: null, receivedAt: new Date("2026-01-01"), ledgerFact: "posted", externalBillId: "qb-1", lines: [{ index: 0, oldAccountExternalId: "acc-old" }] }])
  })

  it("reports a paid document (no succeeded push needed) as ledgerFact 'paid'", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", receivedAt: new Date("2026-01-01"), reviewedData: { vendor: "Acme" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-old" }] }, paymentStatus: "paid", baseCurrencyTotal: null, accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
    ])
    const affected = await findBillsAffectedByAccountChange("w1", "conn1", "acc-old")
    expect(affected).toEqual([expect.objectContaining({ id: "d1", ledgerFact: "paid" })])
  })

  it("excludes a document dismissed via Leave them for this exact old account", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", receivedAt: new Date("2026-01-01"), reviewedData: { vendor: "Acme" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-old" }] }, paymentStatus: "paid", baseCurrencyTotal: null, accountCorrectionDismissedAt: new Date(), accountCorrectionDismissedFromAccountId: "acc-old" },
    ])
    const affected = await findBillsAffectedByAccountChange("w1", "conn1", "acc-old")
    expect(affected).toEqual([])
  })

  it("does NOT exclude a document dismissed for a different old account (a second correction is not silently dropped)", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", receivedAt: new Date("2026-01-01"), reviewedData: { vendor: "Acme" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-newer" }] }, paymentStatus: "paid", baseCurrencyTotal: null, accountCorrectionDismissedAt: new Date(), accountCorrectionDismissedFromAccountId: "acc-old" },
    ])
    const affected = await findBillsAffectedByAccountChange("w1", "conn1", "acc-newer")
    expect(affected).toEqual([expect.objectContaining({ id: "d1" })])
  })
})

describe("findAccountCorrectionReminders (#430 Screen 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.document = { findMany: vi.fn().mockResolvedValue([]) }
    db.integrationPush = { findMany: vi.fn().mockResolvedValue([]) }
  })

  it("returns nothing when every candidate is already on the rule's current account", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", reviewedData: { vendor: "Acme Fuels" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-new" }] }, paymentStatus: "paid", accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
    ])
    const reminders = await findAccountCorrectionReminders("w1", "conn1", [{ supplierName: "acme fuels", accountExternalId: "acc-new" }])
    expect(reminders.size).toBe(0)
  })

  it("counts distinct documents (not lines) still on the old account, keyed by the rule's normalized supplier name", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", reviewedData: { vendor: "Acme Fuels" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-old" }, { account_external_id: "acc-old" }] }, paymentStatus: "paid", accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
      { id: "d2", reviewedData: { vendor: "Acme Fuels" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-old" }] }, paymentStatus: null, accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
    ])
    db.integrationPush.findMany.mockResolvedValue([{ id: "p1", connectionId: "conn1", documentId: "d2", status: "succeeded" }])
    const reminders = await findAccountCorrectionReminders("w1", "conn1", [{ supplierName: "acme fuels", accountExternalId: "acc-new" }])
    expect(reminders.get("acme fuels")).toEqual({ oldAccountExternalId: "acc-old", count: 2 })
  })

  it("matches a document's un-normalized vendor field against the rule's normalized supplierName (regression: raw 'Acme Fuel Co' vs rule-keyed 'acme fuel' silently dropped the reminder)", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", reviewedData: { vendor: "Acme Fuel Co" }, rawExtraction: null, codingData: { items: [{ account_external_id: "sundry-expenses" }] }, paymentStatus: "paid", accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
    ])
    const reminders = await findAccountCorrectionReminders("w1", "conn1", [{ supplierName: "acme fuel", accountExternalId: "fuel" }])
    expect(reminders.get("acme fuel")).toEqual({ oldAccountExternalId: "sundry-expenses", count: 1 })
  })

  it("excludes a document dismissed via Leave them for this exact old account", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", reviewedData: { vendor: "Acme Fuels" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-old" }] }, paymentStatus: "paid", accountCorrectionDismissedAt: new Date(), accountCorrectionDismissedFromAccountId: "acc-old" },
    ])
    const reminders = await findAccountCorrectionReminders("w1", "conn1", [{ supplierName: "acme fuels", accountExternalId: "acc-new" }])
    expect(reminders.size).toBe(0)
  })

  it("ignores a document from a supplier that has no rule in the batch", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", reviewedData: { vendor: "Unknown Co" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-old" }] }, paymentStatus: "paid", accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
    ])
    const reminders = await findAccountCorrectionReminders("w1", "conn1", [{ supplierName: "acme fuels", accountExternalId: "acc-new" }])
    expect(reminders.size).toBe(0)
  })

  it("#459: never counts an item-sourced line as a reminder (its account is the Item's own)", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", reviewedData: { vendor: "Acme Fuels" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-old", account_source: "item" }] }, paymentStatus: "paid", accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
    ])
    const reminders = await findAccountCorrectionReminders("w1", "conn1", [{ supplierName: "acme fuels", accountExternalId: "acc-new" }])
    expect(reminders.size).toBe(0)
  })
})

describe("findBillsAffectedByAccountChange — item lines (#459)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.document = { findMany: vi.fn().mockResolvedValue([]) }
    db.integrationPush = { findMany: vi.fn().mockResolvedValue([]) }
  })

  it("still surfaces the document (the old account is present) but excludes the item-sourced line from `lines`", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", receivedAt: new Date("2026-01-01"), reviewedData: { vendor: "Acme" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-old", account_source: "item" }] }, paymentStatus: "paid", baseCurrencyTotal: null, accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
    ])
    const affected = await findBillsAffectedByAccountChange("w1", "conn1", "acc-old")
    expect(affected).toEqual([expect.objectContaining({ id: "d1", lines: [] })])
  })

  it("includes a non-item line alongside an excluded item-sourced one", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", receivedAt: new Date("2026-01-01"), reviewedData: { vendor: "Acme" }, rawExtraction: null, codingData: { items: [{ account_external_id: "acc-old", account_source: "item" }, { account_external_id: "acc-old" }] }, paymentStatus: "paid", baseCurrencyTotal: null, accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
    ])
    const affected = await findBillsAffectedByAccountChange("w1", "conn1", "acc-old")
    expect(affected).toEqual([expect.objectContaining({ id: "d1", lines: [{ index: 1, oldAccountExternalId: "acc-old" }] })])
  })
})

describe("setDocumentLineToAccount (#459)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.document = { findFirst: vi.fn(), update: vi.fn() }
  })

  it("is a no-op when the document doesn't exist in this workspace", async () => {
    db.document.findFirst.mockResolvedValue(null)
    await setDocumentLineToAccount("w1", "d1", 0)
    expect(db.document.update).not.toHaveBeenCalled()
  })

  it("is a no-op when the line index is out of range", async () => {
    db.document.findFirst.mockResolvedValue({ codingData: { items: [{ account_external_id: "acc-1" }] } })
    await setDocumentLineToAccount("w1", "d1", 5)
    expect(db.document.update).not.toHaveBeenCalled()
  })

  it("clears item_external_id/item_source and sets account_source to manual on the given line only, leaving account_external_id untouched", async () => {
    db.document.findFirst.mockResolvedValue({
      codingData: { items: [
        { account_external_id: "item-acc", item_external_id: "item-1", item_source: "pairing", account_source: "item" },
        { account_external_id: "other-acc", item_external_id: "item-2", item_source: "pairing", account_source: "item" },
      ] },
    })
    await setDocumentLineToAccount("w1", "d1", 0)
    expect(db.document.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { codingData: { items: [
        { account_external_id: "item-acc", item_external_id: null, item_source: null, account_source: "manual" },
        { account_external_id: "other-acc", item_external_id: "item-2", item_source: "pairing", account_source: "item" },
      ] } },
    })
  })
})

describe("dismissAccountCorrectionForDocuments (Leave them)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.document = { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }
  })

  it("is a no-op for an empty selection", async () => {
    await dismissAccountCorrectionForDocuments("w1", [], "acc-old")
    expect(db.document.updateMany).not.toHaveBeenCalled()
  })

  it("stamps the dismissal with the old account it was dismissed for", async () => {
    await dismissAccountCorrectionForDocuments("w1", ["d1", "d2"], "acc-old")
    expect(db.document.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "w1", id: { in: ["d1", "d2"] } },
      data: { accountCorrectionDismissedAt: expect.any(Date), accountCorrectionDismissedFromAccountId: "acc-old" },
    })
  })

  it("is idempotent: re-running on an already-dismissed document just rewrites the same flag", async () => {
    await dismissAccountCorrectionForDocuments("w1", ["d1"], "acc-old")
    await dismissAccountCorrectionForDocuments("w1", ["d1"], "acc-old")
    expect(db.document.updateMany).toHaveBeenCalledTimes(2)
    for (const call of db.document.updateMany.mock.calls) {
      expect(call[0].data.accountCorrectionDismissedFromAccountId).toBe("acc-old")
    }
  })
})

describe("recordAccountCorrectionApplied", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.document = { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) }
  })

  it("rewrites only the lines that carried the old account, clearing any dismissal", async () => {
    db.document.findFirst.mockResolvedValue({ codingData: { items: [{ account_external_id: "acc-old", account_source: "supplier" }, { account_external_id: "acc-other", account_source: "supplier" }] } })
    await recordAccountCorrectionApplied("w1", "d1", "acc-old", "acc-new")
    expect(db.document.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        codingData: { items: [{ account_external_id: "acc-new", account_source: "manual" }, { account_external_id: "acc-other", account_source: "supplier" }] },
        accountCorrectionDismissedAt: null,
        accountCorrectionDismissedFromAccountId: null,
      },
    })
  })

  it("does nothing when the document no longer exists", async () => {
    db.document.findFirst.mockResolvedValue(null)
    await recordAccountCorrectionApplied("w1", "d1", "acc-old", "acc-new")
    expect(db.document.update).not.toHaveBeenCalled()
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

// #429: resolveDocumentCodingItems is the DB-touching orchestration around the pure resolution
// chain in lib/finance/line-account-resolution.ts (that module's own tests cover the pure
// decisions — supplier rule wins, guessed vs confirmed Default, legacy fallback). These tests
// cover only the orchestration: no connection → null, legacy documents route through
// CategoryAccountMapping, current documents route through the supplier-rule/Default chain.
describe("resolveDocumentCodingItems", () => {
  type ResolveInput = Parameters<typeof resolveDocumentCodingItems>[0]
  // The account part of each row — the pre-ADR-0014 assertions below read only that.
  const resolveItems = async (input: ResolveInput) => (await resolveDocumentCodingItems(input))?.items.map(({ account_external_id, account_source, account_archived_fallback }) => ({ account_external_id, account_source, account_archived_fallback })) ?? null
  const account = (externalId: string, defaultTaxCode: string | null = null) => ({ entityType: "account", externalId, parentExternalId: null, forPurchases: null, defaultTaxCode })
  beforeEach(() => {
    db.integrationConnection = { findFirst: vi.fn() }
    db.supplierAccountRule = { findFirst: vi.fn() }
    // Default: the accounts the tests below name are active, so the pre-existing tests (written
    // before the #429 archived-account fallback) keep exercising the ordinary supplier-rule/Default
    // chain, not the fallback path. The fallback has its own describe block.
    db.accountingEntity = { findMany: vi.fn().mockResolvedValue([account("default_1"), account("acme_usual")]) }
    db.supplierItemPairing = { findMany: vi.fn().mockResolvedValue([]) }
  })

  describe("coding set (ADR 0014)", () => {
    const connection = { id: "conn1", createdAt: new Date("2026-01-01"), defaultExpenseAccountId: "default_1", defaultExpenseAccountGuessed: false, ledgerCapabilities: { vat: true, tracking: [{ id: "region", name: "Region" }], location: true, customer: true, billable: true, itemLines: false } }
    const references = [
      account("default_1", "EXEMPT"), account("acme_usual", "EXEMPT"),
      { entityType: "tax_rate", externalId: "INPUT", parentExternalId: null, forPurchases: true, defaultTaxCode: null },
      { entityType: "tax_rate", externalId: "OUTPUT", parentExternalId: null, forPurchases: false, defaultTaxCode: null },
      { entityType: "tax_rate", externalId: "EXEMPT", parentExternalId: null, forPurchases: true, defaultTaxCode: null },
      { entityType: "tracking_option", externalId: "north", parentExternalId: "region", forPurchases: null, defaultTaxCode: null },
      { entityType: "location", externalId: "loc1", parentExternalId: null, forPurchases: null, defaultTaxCode: null },
    ]
    const input: ResolveInput = {
      workspaceId: "w1", vendorName: "Acme", category: null, codingSource: "ai", codedAt: new Date("2026-06-15"), lineCount: 2,
      priorCoding: { items: [{ tax_code: "ZERO", tax_code_source: "manual", customer: "cust1", billable: true }] },
      amounts: { lines: [40, 60], subtotal: 100, taxTotal: 15, total: 115, currency: "ZAR" },
    }

    it("pre-fills the supplier's Tax code, Tracking and Location, keeps a manual value, infers the basis", async () => {
      db.integrationConnection.findFirst.mockResolvedValue(connection)
      db.supplierAccountRule.findFirst.mockResolvedValue({ accountExternalId: "acme_usual", taxCodeExternalId: "INPUT", tracking: [{ categoryId: "region", optionId: "north" }], locationExternalId: "loc1" })
      db.accountingEntity.findMany.mockResolvedValue(references)
      const result = await resolveDocumentCodingItems(input)
      expect(db.accountingEntity.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: "w1", connectionId: "conn1", active: true }) }))
      expect(result?.items).toEqual([
        { account_external_id: "acme_usual", account_source: "supplier", tax_code: "ZERO", tax_code_source: "manual", tracking: [{ category_id: "region", option_id: "north" }], customer: "cust1", billable: true, item_external_id: null, item_source: null },
        { account_external_id: "acme_usual", account_source: "supplier", tax_code: "INPUT", tax_code_source: "supplier", tracking: [{ category_id: "region", option_id: "north" }], customer: null, billable: false, item_external_id: null, item_source: null },
      ])
      expect(result?.bill).toEqual({ location: "loc1", location_source: "supplier", tax_basis: "exclusive", tax_basis_source: "inferred" })
    })

    it("with no rule, lines take the Account's default Tax code and nothing else", async () => {
      db.integrationConnection.findFirst.mockResolvedValue(connection)
      db.supplierAccountRule.findFirst.mockResolvedValue(null)
      db.accountingEntity.findMany.mockResolvedValue(references)
      const result = await resolveDocumentCodingItems({ ...input, priorCoding: {} })
      expect(result?.items[1]).toMatchObject({ account_external_id: "default_1", tax_code: "EXEMPT", tax_code_source: "account_default", tracking: [] })
      expect(result?.bill.location).toBeNull()
    })
  })

  describe("#459: item lines", () => {
    const connection = { id: "conn1", createdAt: new Date("2026-01-01"), defaultExpenseAccountId: "default_1", defaultExpenseAccountGuessed: false, ledgerCapabilities: { vat: true, tracking: [], location: false, customer: true, billable: false, itemLines: true } }
    const references = [
      account("default_1", "EXEMPT"),
      { entityType: "tax_rate", externalId: "ITEM_TAX", parentExternalId: null, forPurchases: true, defaultTaxCode: null },
      { entityType: "item", externalId: "item-1", code: "WID-1", parentExternalId: null, forPurchases: null, defaultTaxCode: "ITEM_TAX", purchaseAccountExternalId: "item_acct", trackedInventory: false },
    ]

    it("overrides the line's account with the resolved item's account, and the item's tax code wins", async () => {
      db.integrationConnection.findFirst.mockResolvedValue(connection)
      db.supplierAccountRule.findFirst.mockResolvedValue(null)
      db.accountingEntity.findMany.mockResolvedValue(references)
      db.supplierItemPairing.findMany.mockResolvedValue([])
      const result = await resolveDocumentCodingItems({
        workspaceId: "w1", vendorName: "Acme", category: null, codingSource: "ai", codedAt: new Date("2026-06-15"), lineCount: 1,
        priorCoding: {}, lineItems: [{ item_code: "WID-1", description: "Widget" }],
      })
      expect(result?.items[0]).toMatchObject({
        account_external_id: "item_acct", account_source: "item",
        item_external_id: "item-1", item_source: "code_match",
        tax_code: "ITEM_TAX", tax_code_source: "item",
      })
    })

    it("reads a supplier's item pairing and resolves it over the item's own code", async () => {
      db.integrationConnection.findFirst.mockResolvedValue(connection)
      db.supplierAccountRule.findFirst.mockResolvedValue(null)
      db.accountingEntity.findMany.mockResolvedValue(references)
      db.supplierItemPairing.findMany.mockResolvedValue([{ matchKey: "blue widget", itemExternalId: "item-1" }])
      const result = await resolveDocumentCodingItems({
        workspaceId: "w1", vendorName: "Acme", category: null, codingSource: "ai", codedAt: new Date("2026-06-15"), lineCount: 1,
        priorCoding: {}, lineItems: [{ item_code: null, description: "Blue Widget" }],
      })
      expect(result?.items[0]).toMatchObject({ item_external_id: "item-1", item_source: "pairing" })
    })

    it("stays an account line when nothing matches", async () => {
      db.integrationConnection.findFirst.mockResolvedValue(connection)
      db.supplierAccountRule.findFirst.mockResolvedValue(null)
      db.accountingEntity.findMany.mockResolvedValue(references)
      db.supplierItemPairing.findMany.mockResolvedValue([])
      const result = await resolveDocumentCodingItems({
        workspaceId: "w1", vendorName: "Acme", category: null, codingSource: "ai", codedAt: new Date("2026-06-15"), lineCount: 1,
        priorCoding: {}, lineItems: [{ item_code: "UNKNOWN", description: "Consulting" }],
      })
      expect(result?.items[0]).toMatchObject({ account_external_id: "default_1", account_source: "default_confirmed", item_external_id: null, item_source: null })
    })
  })

  it("resolves nothing when the workspace has no connected accounting connection", async () => {
    db.integrationConnection.findFirst.mockResolvedValue(null)
    const items = await resolveItems({
      workspaceId: "w1", vendorName: "Acme", category: "software", codingSource: null, codedAt: new Date("2026-01-01"), lineCount: 2,
    })
    expect(items).toBeNull()
  })

  it("a document coded before the connection existed resolves through the legacy category chain, not a supplier rule", async () => {
    db.integrationConnection.findFirst.mockResolvedValue({
      id: "conn1", createdAt: new Date("2026-06-01"), defaultExpenseAccountId: "default_1", defaultExpenseAccountGuessed: false,
    })
    const items = await resolveItems({
      workspaceId: "w1", vendorName: "Acme", category: "software", codingSource: "ai", codedAt: new Date("2026-01-01"), lineCount: 2,
    })
    expect(db.supplierAccountRule.findFirst).not.toHaveBeenCalled()
    expect(items).toEqual([
      { account_external_id: "default_1", account_source: null },
      { account_external_id: "default_1", account_source: null },
    ])
  })

  it("a current document with a matching supplier rule resolves every line to the rule's account", async () => {
    db.integrationConnection.findFirst.mockResolvedValue({
      id: "conn1", createdAt: new Date("2026-01-01"), defaultExpenseAccountId: "default_1", defaultExpenseAccountGuessed: true,
    })
    db.supplierAccountRule.findFirst.mockResolvedValue({ accountExternalId: "acme_usual" })
    const items = await resolveItems({
      workspaceId: "w1", vendorName: "Acme Holdings", category: null, codingSource: "ai", codedAt: new Date("2026-06-15"), lineCount: 1,
    })
    expect(items).toEqual([{ account_external_id: "acme_usual", account_source: "supplier" }])
  })

  it("a current document with no supplier rule falls back to the connection's Default, marked guessed", async () => {
    db.integrationConnection.findFirst.mockResolvedValue({
      id: "conn1", createdAt: new Date("2026-01-01"), defaultExpenseAccountId: "default_1", defaultExpenseAccountGuessed: true,
    })
    db.supplierAccountRule.findFirst.mockResolvedValue(null)
    const items = await resolveItems({
      workspaceId: "w1", vendorName: "New Vendor", category: null, codingSource: "ai", codedAt: new Date("2026-06-15"), lineCount: 1,
    })
    expect(items).toEqual([{ account_external_id: "default_1", account_source: "default_guessed" }])
  })

  it("stamps at least one row even for a document with no line items, so the synthesized 'Total' line still gets an account", async () => {
    db.integrationConnection.findFirst.mockResolvedValue({
      id: "conn1", createdAt: new Date("2026-01-01"), defaultExpenseAccountId: "default_1", defaultExpenseAccountGuessed: true,
    })
    db.supplierAccountRule.findFirst.mockResolvedValue(null)
    const items = await resolveItems({
      workspaceId: "w1", vendorName: null, category: null, codingSource: "ai", codedAt: new Date("2026-06-15"), lineCount: 0,
    })
    expect(items).toHaveLength(1)
  })

  describe("archived-account fallback (#429)", () => {
    it("falls back to the Default and flags the row when the matched supplier rule's account is archived", async () => {
      db.integrationConnection.findFirst.mockResolvedValue({
        id: "conn1", createdAt: new Date("2026-01-01"), defaultExpenseAccountId: "default_1", defaultExpenseAccountGuessed: false,
      })
      db.supplierAccountRule.findFirst.mockResolvedValue({ accountExternalId: "acme_usual" })
      db.accountingEntity.findMany.mockResolvedValue([account("default_1")]) // acme_usual not active
      const items = await resolveItems({
        workspaceId: "w1", vendorName: "Acme", category: null, codingSource: "ai", codedAt: new Date("2026-06-15"), lineCount: 1,
      })
      expect(items).toEqual([{ account_external_id: "default_1", account_source: "default_confirmed", account_archived_fallback: true }])
    })

    it("resolves no account at all when the connection's Default itself is archived and there is no rule", async () => {
      db.integrationConnection.findFirst.mockResolvedValue({
        id: "conn1", createdAt: new Date("2026-01-01"), defaultExpenseAccountId: "default_1", defaultExpenseAccountGuessed: false,
      })
      db.supplierAccountRule.findFirst.mockResolvedValue(null)
      db.accountingEntity.findMany.mockResolvedValue([]) // default_1 not active
      const items = await resolveItems({
        workspaceId: "w1", vendorName: "New Vendor", category: null, codingSource: "ai", codedAt: new Date("2026-06-15"), lineCount: 1,
      })
      expect(items).toEqual([{ account_external_id: null, account_source: null }])
    })
  })
})

// #429: getBillAccountPickerData feeds the Detail pane's per-line Account select (spec §A) — the
// synced accounts, the vendor's supplier rule (if any) and the provider's display name.
describe("getBillAccountPickerData", () => {
  beforeEach(() => {
    db.integrationConnection = { findFirst: vi.fn() }
    db.supplierAccountRule = { findFirst: vi.fn() }
    vi.mocked(listAccountingEntities).mockResolvedValue([{ externalId: "acc_1", code: "6100", name: "Office supplies" }])
  })

  it("returns null when the workspace has no connected accounting connection", async () => {
    db.integrationConnection.findFirst.mockResolvedValue(null)
    const result = await getBillAccountPickerData("w1", "Acme")
    expect(result).toBeNull()
    expect(db.supplierAccountRule.findFirst).not.toHaveBeenCalled()
  })

  it("skips the supplier-rule lookup and returns a null supplierRuleAccountId when there is no vendor name", async () => {
    db.integrationConnection.findFirst.mockResolvedValue({ id: "conn1", provider: "quickbooks" })
    const result = await getBillAccountPickerData("w1", null)
    expect(db.supplierAccountRule.findFirst).not.toHaveBeenCalled()
    expect(result).toEqual({
      accountOptions: [{ externalId: "acc_1", code: "6100", name: "Office supplies" }],
      supplierRuleAccountId: null,
      providerName: "QuickBooks",
    })
  })

  it("returns the vendor's supplier-rule account and the provider's display name when both exist", async () => {
    db.integrationConnection.findFirst.mockResolvedValue({ id: "conn1", provider: "xero" })
    db.supplierAccountRule.findFirst.mockResolvedValue({ accountExternalId: "acme_usual" })
    const result = await getBillAccountPickerData("w1", "Acme Holdings")
    expect(result).toEqual({
      accountOptions: [{ externalId: "acc_1", code: "6100", name: "Office supplies" }],
      supplierRuleAccountId: "acme_usual",
      providerName: "Xero",
    })
  })
})

describe("learnSupplierAccountRuleFromApproval", () => {
  beforeEach(() => {
    db.document = { findFirst: vi.fn() }
    db.integrationConnection = { findFirst: vi.fn() }
    db.supplierAccountRule = { upsert: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) }
  })

  it("upserts a rule keyed on the connection and the normalized supplier for the line with the largest amount", async () => {
    const { learnSupplierAccountRuleFromApproval } = await import("@/models/documents")
    db.document.findFirst.mockResolvedValue({
      reviewedData: { vendor: "ACME Ltd.", line_items: [{ amount: 10 }, { amount: 90 }] },
      codingData: { items: [{ account_external_id: "small_acct", account_source: "default_guessed" }, { account_external_id: "big_acct", account_source: "default_guessed" }] },
    })
    db.integrationConnection.findFirst.mockResolvedValue({ id: "conn1" })
    await learnSupplierAccountRuleFromApproval("w1", "doc1")
    expect(db.supplierAccountRule.upsert).toHaveBeenCalledWith({
      where: { connectionId_supplierName: { connectionId: "conn1", supplierName: "acme" } },
      create: { workspaceId: "w1", connectionId: "conn1", supplierName: "acme", accountExternalId: "big_acct", taxCodeExternalId: null, tracking: [], locationExternalId: null, lastUsedAt: expect.any(Date) },
      update: { accountExternalId: "big_acct", taxCodeExternalId: null, tracking: [], locationExternalId: null, lastUsedAt: expect.any(Date) },
    })
  })

  it("learns the largest line's Tax code and Tracking and the bill's Location — never Customer or Billable", async () => {
    const { learnSupplierAccountRuleFromApproval } = await import("@/models/documents")
    db.document.findFirst.mockResolvedValue({
      reviewedData: { vendor: "Acme", line_items: [{ amount: 90 }] },
      codingData: {
        location: "loc1",
        items: [{ account_external_id: "acct", account_source: "supplier", tax_code: "INPUT", tax_code_source: "manual", tracking: [{ category_id: "region", option_id: "north" }], customer: "cust1", billable: true }],
      },
    })
    db.integrationConnection.findFirst.mockResolvedValue({ id: "conn1" })
    // Same Account, different Tax code: the row updates but no correction is offered.
    db.supplierAccountRule.findUnique.mockResolvedValueOnce({ accountExternalId: "acct" })
    await expect(learnSupplierAccountRuleFromApproval("w1", "doc1")).resolves.toBeNull()
    const set = { accountExternalId: "acct", taxCodeExternalId: "INPUT", tracking: [{ categoryId: "region", optionId: "north" }], locationExternalId: "loc1" }
    const call = db.supplierAccountRule.upsert.mock.calls[0][0]
    expect(call.update).toEqual({ ...set, lastUsedAt: expect.any(Date) })
    expect(call.create).toEqual({ workspaceId: "w1", connectionId: "conn1", supplierName: "acme", ...set, lastUsedAt: expect.any(Date) })
  })

  it("returns the old→new change when it retargets an existing rule, and null on a first-time create", async () => {
    const { learnSupplierAccountRuleFromApproval } = await import("@/models/documents")
    db.document.findFirst.mockResolvedValue({
      reviewedData: { vendor: "Acme", line_items: [{ amount: 10 }] },
      codingData: { items: [{ account_external_id: "new_acct", account_source: "default_guessed" }] },
    })
    db.integrationConnection.findFirst.mockResolvedValue({ id: "conn1" })
    db.supplierAccountRule.findUnique.mockResolvedValueOnce({ accountExternalId: "old_acct" })
    await expect(learnSupplierAccountRuleFromApproval("w1", "doc1")).resolves.toEqual({ connectionId: "conn1", oldAccountExternalId: "old_acct", newAccountExternalId: "new_acct" })

    db.supplierAccountRule.findUnique.mockResolvedValueOnce(null)
    await expect(learnSupplierAccountRuleFromApproval("w1", "doc1")).resolves.toBeNull()

    db.supplierAccountRule.findUnique.mockResolvedValueOnce({ accountExternalId: "new_acct" })
    await expect(learnSupplierAccountRuleFromApproval("w1", "doc1")).resolves.toBeNull()
  })

  it("#459: excludes item lines from the account scan and upserts a pairing for each resolved item line", async () => {
    const { learnSupplierAccountRuleFromApproval } = await import("@/models/documents")
    db.document.findFirst.mockResolvedValue({
      reviewedData: { vendor: "Acme", line_items: [{ amount: 900, item_code: "WID-1", description: "Widget" }, { amount: 10, account_source: "default_guessed" }] },
      codingData: {
        items: [
          { account_external_id: "item_acct", account_source: "item", item_external_id: "item-1", item_source: "pairing" },
          { account_external_id: "small_acct", account_source: "default_guessed" },
        ],
      },
    })
    db.integrationConnection.findFirst.mockResolvedValue({ id: "conn1" })
    db.supplierItemPairing = { upsert: vi.fn() }
    await learnSupplierAccountRuleFromApproval("w1", "doc1")
    // The big item line is excluded from the account scan — "small_acct" (the only non-item line) wins.
    expect(db.supplierAccountRule.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ accountExternalId: "small_acct" }),
    }))
    expect(db.supplierItemPairing.upsert).toHaveBeenCalledWith({
      where: { connectionId_supplierName_matchKey: { connectionId: "conn1", supplierName: "acme", matchKey: "wid-1" } },
      create: { workspaceId: "w1", connectionId: "conn1", supplierName: "acme", matchKey: "wid-1", itemExternalId: "item-1", lastUsedAt: expect.any(Date) },
      update: { itemExternalId: "item-1", lastUsedAt: expect.any(Date) },
    })
  })

  it("does nothing for a legacy-chain resolution (no account_source)", async () => {
    const { learnSupplierAccountRuleFromApproval } = await import("@/models/documents")
    db.document.findFirst.mockResolvedValue({
      reviewedData: { vendor: "Acme", line_items: [{ amount: 10 }] },
      codingData: { items: [{ account_external_id: "legacy_acct", account_source: null }] },
    })
    await learnSupplierAccountRuleFromApproval("w1", "doc1")
    expect(db.integrationConnection.findFirst).not.toHaveBeenCalled()
    expect(db.supplierAccountRule.upsert).not.toHaveBeenCalled()
  })

  it("does nothing when the document has no vendor name", async () => {
    const { learnSupplierAccountRuleFromApproval } = await import("@/models/documents")
    db.document.findFirst.mockResolvedValue({
      reviewedData: { line_items: [{ amount: 10 }] },
      codingData: { items: [{ account_external_id: "acct", account_source: "default_guessed" }] },
    })
    await learnSupplierAccountRuleFromApproval("w1", "doc1")
    expect(db.supplierAccountRule.upsert).not.toHaveBeenCalled()
  })
})

describe("touchSupplierAccountRuleUsage", () => {
  beforeEach(() => {
    db.supplierAccountRule = { updateMany: vi.fn() }
  })

  it("bumps lastUsedAt for the matching rule", async () => {
    const { touchSupplierAccountRuleUsage } = await import("@/models/documents")
    await touchSupplierAccountRuleUsage("w1", "conn1", "ACME Ltd.", "acct_1")
    expect(db.supplierAccountRule.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "w1", connectionId: "conn1", supplierName: "acme", accountExternalId: "acct_1" },
      data: { lastUsedAt: expect.any(Date) },
    })
  })

  it("does nothing without a vendor name or account", async () => {
    const { touchSupplierAccountRuleUsage } = await import("@/models/documents")
    await touchSupplierAccountRuleUsage("w1", "conn1", null, "acct_1")
    await touchSupplierAccountRuleUsage("w1", "conn1", "Acme", null)
    expect(db.supplierAccountRule.updateMany).not.toHaveBeenCalled()
  })
})

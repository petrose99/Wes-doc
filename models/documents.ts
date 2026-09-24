import { SUPPORTED_AUDIO_TYPES, isSupportedAudioBuffer } from "@/lib/asr/types"
import { track } from "@/lib/analytics"
import { auditEventData, getRequestAuditContext, recordDocumentAudit } from "@/lib/audit"
import { SUPPLIER_FIELD_BY_TEMPLATE } from "@/lib/automation/rules"
import config from "@/lib/config"
import { hasDirectionField, isPushableDocument, PaidStatus, resolveDocType, type DocType } from "@/lib/doc-types"
import { findMissingRequiredFields, parseTemplateFields, validateDocumentValues } from "@/lib/document-templates"
import { deleteDocumentSource, documentBlocksKey, documentStorageKey, putDocumentSource } from "@/lib/document-storage"
import { projectDocumentFields } from "@/lib/field-projection"
import { LOW_CONFIDENCE, PIPELINE_STAGES, type PipelineStage } from "@/lib/documents/stages"
import { applyFxToDocument } from "@/lib/fx/apply-to-document"
import { normalizeBillFromDocument } from "@/lib/integration-bill-mapping"
import { resolveDocumentLineAccounts, resolveLineAccount, usesLegacyAccountChain, type LineAccountRow } from "@/lib/finance/line-account-resolution"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"
import { unscoped } from "@/lib/workspace-scope"
import type { DocumentProvenance } from "@/lib/provenance"
import { replaceDocumentFieldValues } from "@/models/document-field-values"
import { recordCodingCorrection } from "@/models/coding-corrections"
import { recordFieldCorrection } from "@/models/field-corrections"
import { resetSupplierStreak } from "@/models/suppliers"
import { listWorkspaceIntegrationPushes, getCategoryAccountMap } from "@/models/integrations"
import { listCategoryAccountMappings, resolveCategoryAccount } from "@/models/category-account-mappings"
import { listAccountingEntities } from "@/models/accounting-entities"
import { getDocumentPaymentStatuses } from "@/models/ledger-payments"
import { emitWorkspaceEvent } from "@/lib/webhooks"
import { resolveDuplicateGatesAgainst } from "@/lib/gates/duplicate"
import { kickWebhookDrain } from "@/lib/webhook-delivery"
import { prisma } from "@/lib/db"
import { Document, Prisma } from "@/prisma/client"
import crypto from "crypto"
import path from "path"
import { randomUUID } from "crypto"
import { cache } from "react"

const SUPPORTED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"])
/** "dictation" is an audio recording rather than a scan; it takes the transcribe path instead of
 * MinerU, and is otherwise an ordinary Document (see lib/document-transcription). */
export type DocumentSource = "upload" | "dictation"

export const documentHash = (buffer: Buffer) => crypto.createHash("sha256").update(buffer).digest("hex")

export function cleanFilename(filename: string) {
  const sanitized = path.basename(filename).replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim()
  return (sanitized || "document").slice(0, 255)
}

export function isSupportedDocumentBuffer(buffer: Buffer, mimeType: string) {
  // Audio is validated by its own container magic bytes, and only when dictation is configured —
  // with ASR off an audio upload is refused as an unsupported type rather than accepted and queued
  // for a job that can never run.
  if (SUPPORTED_AUDIO_TYPES.has(mimeType)) return config.asr.enabled && isSupportedAudioBuffer(buffer, mimeType)
  if (!SUPPORTED_DOCUMENT_TYPES.has(mimeType)) return false
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  if (mimeType === "image/jpeg") return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  return buffer.subarray(4, 8).toString("ascii") === "ftyp"
}

/** Audio is always recorded as source "dictation", whatever the caller passed.
 *
 * A dictation is uploaded through the ordinary upload path — it IS an ordinary upload — so every
 * caller passes "upload". But Document.source is what later decides whether a chunk is tagged `asr`
 * or `vlm_ocr`, and trusting the caller meant every dictated snippet was cited as though it had
 * been read off a printed page. Derived here, next to the job-type choice, so the two cannot
 * disagree about what kind of document this is. */
export function documentSourceFor(mimeType: string, fallback: DocumentSource): DocumentSource {
  return SUPPORTED_AUDIO_TYPES.has(mimeType) ? "dictation" : fallback
}

export function validateDocumentInput(buffer: Buffer, mimeType: string) {
  if (!buffer.length || buffer.length > config.documents.maxFileSizeBytes) throw new Error("invalid_document_size")
  if (!isSupportedDocumentBuffer(buffer, mimeType)) throw new Error("unsupported_document_type")
}

export function searchableText(data: Record<string, unknown>, filename: string) {
  const flatten = (value: unknown): string[] => {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)]
    if (Array.isArray(value)) return value.flatMap(flatten)
    if (value && typeof value === "object") return Object.values(value).flatMap(flatten)
    return []
  }
  return [filename, ...flatten(data)].join(" ").slice(0, 20_000)
}

export async function createDocumentFromBuffer(input: {
  workspaceId: string; fileId: string; templateId: string; source: DocumentSource; filename: string; mimeType: string; buffer: Buffer; receivedAt?: Date; pageRange?: string | null; uploadBatchId?: string | null
  /** True when nothing human chose this worksheet — an intake channel guessed it (email infers
   * one from the subject line). Recorded as codingData.worksheetSource so the classification
   * pass may re-point it once the document's actual content is known; an explicit pick from the
   * upload modal's document-type picker is left unmarked and is never overridden. */
  worksheetAutoAssigned?: boolean
  /** The sender's address for an emailed-in document, or null for every other channel. See
   * lib/ingestion.ts's note on the same field. */
  sourceEmail?: string | null
  /** The sender's WhatsApp number for a WhatsApp-in document, or null for every other channel.
   * Same shape and purpose as sourceEmail. */
  sourceWhatsapp?: string | null
}) {
  validateDocumentInput(input.buffer, input.mimeType)
  // Scoped by fileId as well as workspaceId: worksheet codes are only unique within a file, so
  // a template from a *different* file must never satisfy this lookup.
  const template = await prisma.documentTemplate.findFirst({
    where: { id: input.templateId, workspaceId: input.workspaceId, fileId: input.fileId },
    include: { versions: { where: { version: { not: undefined } }, orderBy: { version: "desc" }, take: 1 } },
  })
  const version = template?.versions[0]
  if (!template || !version) throw new Error("document_template_not_found")
  const sha256 = documentHash(input.buffer)
  // Dedup is per file, not per workspace: the same PDF may legitimately be extracted into two
  // different files with two different column sets.
  const existing = await prisma.document.findUnique({ where: { fileId_sha256: { fileId: input.fileId, sha256 } } })
  if (existing) {
    const job = await prisma.documentProcessingJob.findFirst({ where: { workspaceId: input.workspaceId, documentId: existing.id, status: "queued" }, orderBy: { createdAt: "desc" } })
    return { document: existing, job, duplicate: true }
  }

  // Free-trial storage cap: sum the bytes this workspace already stores and refuse the upload
  // rather than commit it if the new document would push the workspace past the cap. Only reached
  // after the dedup check, so a re-upload of a document that is already stored (returned as a
  // duplicate above) never triggers this.
  const cap = config.documents.freeTrialWorkspaceStorageBytes
  const used = (await prisma.document.aggregate({ where: { workspaceId: input.workspaceId }, _sum: { sizeBytes: true } }))._sum.sizeBytes ?? 0
  if (used + input.buffer.length > cap) throw new Error("free_trial_storage_exceeded")

  const id = randomUUID()
  const storageKey = documentStorageKey(input.workspaceId, id)
  const receivedAt = input.receivedAt || new Date()
  await putDocumentSource(storageKey, input.buffer, input.mimeType)
  try {
    let webhookQueued = false
    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({ data: {
        id, workspaceId: input.workspaceId, fileId: input.fileId, templateId: template.id, templateVersionId: version.id,
        source: documentSourceFor(input.mimeType, input.source), sourceEmail: input.sourceEmail || null,
        sourceWhatsapp: input.sourceWhatsapp || null,
        status: "queued", filename: cleanFilename(input.filename), mimeType: input.mimeType, sizeBytes: input.buffer.length,
        sha256, storageKey, receivedAt, pageRange: input.pageRange?.trim() || null, uploadBatchId: input.uploadBatchId || null,
        fieldSnapshot: version.fields as Prisma.InputJsonValue, searchText: cleanFilename(input.filename),
        ...(input.worksheetAutoAssigned ? { codingData: { worksheetSource: "auto" } as Prisma.InputJsonValue } : {}),
      } })
      // Audio goes to the transcribe handler, everything else to MinerU extraction. This is the
      // only place the two ingestion paths diverge — from the job onwards they are the same code.
      const job = await tx.documentProcessingJob.create({ data: { workspaceId: input.workspaceId, documentId: document.id, type: SUPPORTED_AUDIO_TYPES.has(input.mimeType) ? "transcribe" : "extract" } })
      await recordDocumentAudit({ workspaceId: input.workspaceId, documentId: document.id, type: "document_received" }, tx)
      const emitted = await emitWorkspaceEvent(tx, {
        workspaceId: input.workspaceId, type: "document.received", createdAt: new Date(),
        document: { id: document.id, filename: document.filename, status: document.status, receivedAt: document.receivedAt, reviewedData: document.reviewedData, templateCode: template.code, confidence: document.confidence },
      })
      webhookQueued = emitted.queued > 0
      return { document, job, duplicate: false }
    })
    if (webhookQueued) await kickWebhookDrain()
    return result
  } catch (error) {
    await deleteDocumentSource(storageKey)
    throw error
  }
}

/** The full where-fragment for one pipeline stage. Inbox/Review/Approved/Paid are mutually
 * exclusive (precedence matches documentStage: Paid > Synced > Review > Approved > Inbox), but
 * Synced is deliberately CUMULATIVE — it keeps a bill after it's paid. A controller asking "what
 * did we push to the ledger this month?" queries by the sync event, and a paid bill vanishing
 * from that answer reads as a data loss, not a stage transition. The list marks paid rows with a
 * chip instead. Consequence: Synced's count overlaps Paid's, so the five counts do NOT sum to the
 * workspace total — the tab badges are per-question answers, not a partition. */
const openReviewTaskExists: Prisma.DocumentWhereInput = { reviewTasks: { some: { status: { in: ["open", "in_review"] } } } }
const noOpenReviewTask: Prisma.DocumentWhereInput = { reviewTasks: { none: { status: { in: ["open", "in_review"] } } } }
const succeededPushExists: Prisma.DocumentWhereInput = { integrationPushes: { some: { status: "succeeded" } } }
const noSucceededPush: Prisma.DocumentWhereInput = { integrationPushes: { none: { status: "succeeded" } } }
const paidPaymentStatus: Prisma.DocumentWhereInput = { paymentStatus: "paid" }
/** NULL-safe "not paid": `NOT paymentStatus = 'paid'` is NULL for NULL rows in SQL, so a plain
 * `NOT paidPaymentStatus` predicate silently drops every unpaid row where paymentStatus is null
 * (the common case — nobody has confirmed either way yet). The OR-with-null spells the check out
 * so NULLs land on the "not paid" side, not in a third undefined bucket. */
const notPaid: Prisma.DocumentWhereInput = { OR: [{ paymentStatus: null }, { paymentStatus: { not: "paid" } }] }

export function stageWhereClause(stage: PipelineStage): Prisma.DocumentWhereInput {
  switch (stage) {
    case "inbox":
      return { status: { in: ["queued", "failed"] } }
    case "review":
      return {
        AND: [notPaid, noSucceededPush],
        OR: [
          { status: { in: ["needs_review", "ready_for_review"] } },
          { status: "reviewed", ...openReviewTaskExists },
        ],
      }
    case "approved":
      return {
        status: "reviewed",
        AND: [notPaid, noSucceededPush, noOpenReviewTask],
      }
    case "synced":
      return {
        status: "reviewed",
        ...succeededPushExists,
      }
    case "paid":
      return { ...paidPaymentStatus }
  }
}

/** #264: "has this workspace ever held a document" — every type, every status, including
 * cancelled and still-processing (§2's cross-type decision, #241 d.3). Used only to pick the
 * empty-queue state, so a plain count is enough. */
export const countWorkspaceDocuments = cache((workspaceId: string) => prisma.document.count({ where: { workspaceId } }))

/** `stage`, when given, narrows to a pipeline tab (lib/documents/stages.ts) instead of a raw
 * status. It composes with (does not replace) `status`, though callers normally pass one or the
 * other. Archive is its own axis: every stage except "archive" implicitly excludes an archived
 * document, so a document doesn't linger on "Ready" after being archived from it. */
export async function listWorkspaceDocuments(workspaceId: string, filters: { status?: string; query?: string; templateId?: string; fileId?: string; stage?: PipelineStage; documentIds?: string[]; docType?: DocType } = {}) {
  const where: Prisma.DocumentWhereInput = {
    workspaceId,
    ...(filters.fileId ? { fileId: filters.fileId } : {}),
    ...(filters.documentIds?.length ? { id: { in: filters.documentIds } } : {}),
    ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.stage ? stageWhereClause(filters.stage) : {}),
    ...(filters.query?.trim() ? { OR: [{ searchText: { contains: filters.query.trim(), mode: "insensitive" as const } }, { ocrText: { contains: filters.query.trim(), mode: "insensitive" as const } }] } : {}),
    ...(filters.templateId ? { templateId: filters.templateId } : {}),
    ...(filters.docType ? {
      OR: [
        { docType: filters.docType },
        ...(filters.docType === "invoice" ? [{ docType: null, template: { code: { in: ["invoice", "expense"] } } }] : []),
        ...(filters.docType === "receipt" ? [{ docType: null, template: { code: { in: ["receipt", "expense_receipt"] } } }] : []),
        ...(filters.docType === "bank_statement" ? [{ docType: null, template: { code: "bank_statement" } }] : []),
        ...(filters.docType === "purchase_order" ? [{ docType: null, template: { code: "purchase_order" } }] : []),
      ],
    } : {}),
  }
  return prisma.document.findMany({ where, include: { template: { include: { versions: { take: 1, orderBy: { createdAt: "desc" } } } }, templateVersion: true }, orderBy: { receivedAt: "desc" }, take: 100 })
}

export type LibraryListFilters = {
  templateId?: string
  category?: string
  supplier?: string
  receivedFrom?: Date
  receivedTo?: Date
  flagged?: boolean
  filenameQuery?: string
  documentIds?: string[]
  sort?: "receivedAt" | "filename"
  dir?: "asc" | "desc"
  page?: number
  pageSize?: number
}

export type LibraryDocument = Awaited<ReturnType<typeof listWorkspaceDocuments>>[number]

/** Docu Search membership: every reviewed document, automatically — approved, synced, and paid
 * alike. Deliberately NOT stageWhereClause("approved"): a document does not leave the library
 * when it syncs or gets paid, and there is no "store to library" action any more; approval is
 * the only gate. */
export const LIBRARY_WHERE: Prisma.DocumentWhereInput = { status: "reviewed" }

export async function listLibraryDocuments(workspaceId: string, filters: LibraryListFilters = {}): Promise<{ documents: LibraryDocument[]; total: number; page: number; pageCount: number }> {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 24, 1), 100)

  if (filters.documentIds?.length) {
    const where: Prisma.DocumentWhereInput = { workspaceId, id: { in: filters.documentIds }, ...LIBRARY_WHERE }
    const docs = await prisma.document.findMany({ where, include: { template: { include: { versions: { take: 1, orderBy: { createdAt: "desc" } } } }, templateVersion: true } })
    const idOrder = new Map(filters.documentIds.map((id, i) => [id, i]))
    docs.sort((a, b) => (idOrder.get(a.id) ?? Infinity) - (idOrder.get(b.id) ?? Infinity))
    return { documents: docs, total: docs.length, page: 1, pageCount: 1 }
  }

  const where: Prisma.DocumentWhereInput = {
    workspaceId,
    ...LIBRARY_WHERE,
    ...(filters.templateId ? { templateId: filters.templateId } : {}),
    ...(filters.flagged ? { flaggedAt: { not: null } } : {}),
    ...(filters.filenameQuery?.trim() ? { filename: { contains: filters.filenameQuery.trim(), mode: "insensitive" as const } } : {}),
    ...((filters.receivedFrom || filters.receivedTo) ? {
      receivedAt: {
        ...(filters.receivedFrom ? { gte: filters.receivedFrom } : {}),
        ...(filters.receivedTo ? { lte: filters.receivedTo } : {}),
      },
    } : {}),
    ...(filters.supplier ? {
      fieldValues: { some: { fieldKey: "supplier_name", itemKey: null, valueText: { contains: filters.supplier, mode: "insensitive" as const } } },
    } : {}),
    ...(filters.category ? {
      OR: [
        { codingData: { path: ["account"], string_contains: filters.category } },
        { reviewedData: { path: ["category"], string_contains: filters.category } },
      ],
    } : {}),
  }

  const orderBy: Prisma.DocumentOrderByWithRelationInput = {
    [filters.sort ?? "receivedAt"]: filters.dir ?? "desc",
  }

  const [docs, total] = await prisma.$transaction([
    prisma.document.findMany({
      where,
      include: { template: { include: { versions: { take: 1, orderBy: { createdAt: "desc" } } } }, templateVersion: true },
      orderBy,
      skip: (Math.max((filters.page ?? 1), 1) - 1) * pageSize,
      take: pageSize,
    }),
    prisma.document.count({ where }),
  ])

  const pageCount = Math.max(Math.ceil(total / pageSize), 1)
  const page = Math.min(Math.max(filters.page ?? 1, 1), pageCount)

  return { documents: docs, total, page, pageCount }
}

/** Per-stage counts for the pipeline tabs, sharing stageWhereClause with listWorkspaceDocuments so
 * a tab's badge count can never disagree with what clicking it shows. One query per stage (five
 * total) rather than a single groupBy: the ready/approvals split depends on ReviewTask existence,
 * which groupBy can't express in one pass over `status` alone. */
export async function countDocumentsByStage(workspaceId: string): Promise<Record<PipelineStage, number>> {
  const counts = await Promise.all(PIPELINE_STAGES.map((stage) => prisma.document.count({ where: { workspaceId, ...stageWhereClause(stage) } })))
  return Object.fromEntries(PIPELINE_STAGES.map((stage, index) => [stage, counts[index]])) as Record<PipelineStage, number>
}

/** Failed extractions in the workspace — the one thing on the Inbox tab that needs a person to
 * act (re-extract or delete) rather than wait. Surfaced as its own red sub-badge on the Inbox tab
 * so a failure isn't visually buried among documents that are merely still processing. */
export async function countFailedDocuments(workspaceId: string): Promise<number> {
  return prisma.document.count({ where: { workspaceId, status: "failed" } })
}

/** Home's "Documents this month" stat — a plain calendar-month count off `receivedAt`, the same
 * timestamp the pipeline list sorts and displays by. Not stage-filtered: a document counts here
 * the moment it lands, whichever stage it's since moved through. */
export async function countDocumentsThisMonth(workspaceId: string, now: Date = new Date()): Promise<number> {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return prisma.document.count({ where: { workspaceId, receivedAt: { gte: startOfMonth } } })
}

/** Home's "Recent files" card badge: how many of each file's documents are sitting on the To
 * review stage, so the card can say "2 in review" the same way the pipeline tab would rather than
 * a generic document count. groupBy rather than N queries — one round trip for every file on the
 * card regardless of how many there are. */
export async function countToReviewByFile(workspaceId: string, fileIds: string[]): Promise<Record<string, number>> {
  if (!fileIds.length) return {}
  const rows = await prisma.document.groupBy({ by: ["fileId"], where: { workspaceId, fileId: { in: fileIds }, ...stageWhereClause("review") }, _count: { _all: true } })
  return Object.fromEntries(rows.map((row) => [row.fileId, row._count._all]))
}

/** Of the given document ids, which currently belong to `stage` — used to narrow the workspace-
 * wide content-search hits (lib/retrieval.ts::searchDocumentsByContent spans every document) down
 * to the tab actually being viewed, the same way the ordinary filename/OCR-text match already is. */
export async function documentIdsInStage(workspaceId: string, documentIds: string[], stage: PipelineStage): Promise<Set<string>> {
  if (!documentIds.length) return new Set()
  const rows = await prisma.document.findMany({ where: { workspaceId, id: { in: documentIds }, ...stageWhereClause(stage) }, select: { id: true } })
  return new Set(rows.map((row) => row.id))
}

/** Of the given document ids, which are in Docu Search (any reviewed document — see
 * LIBRARY_WHERE). The library-search narrowing filter, replacing the old stage-based one that
 * silently dropped synced/paid documents from library search results. */
export async function documentIdsInLibrary(workspaceId: string, documentIds: string[]): Promise<Set<string>> {
  if (!documentIds.length) return new Set()
  const rows = await prisma.document.findMany({ where: { workspaceId, id: { in: documentIds }, ...LIBRARY_WHERE }, select: { id: true } })
  return new Set(rows.map((row) => row.id))
}

export const getWorkspaceDocument = (workspaceId: string, documentId: string) => prisma.document.findFirst({ where: { id: documentId, workspaceId }, include: { template: true, templateVersion: true } })

export type ReadyToPushDocument = {
  id: string
  filename: string
  vendorName: string
  total: number
  currencyCode: string | null
  category: string
  /** #249: lets a caller link the row to its typed destination instead of the nav-less
   * `/pipeline` (see `lib/typed-destinations.ts`'s `documentDestinationPath`). */
  docType: string | null
}

export type ReadyToPushResult = {
  documents: ReadyToPushDocument[]
  /** #249: how many otherwise-eligible approved documents were silently excluded for having no
   * usable total — previously dropped with no trace, so a reader comparing this list against an
   * "Approved" count shown elsewhere (the pipeline stage tally) saw fewer rows here with no
   * explanation. Counted separately from the isPushableDocument/already-succeeded exclusions,
   * which are expected and don't need surfacing. */
  droppedCount: number
}

/** Documents on the "Ready" pipeline stage whose type is pushable to accounting and that don't
 * already have a succeeded push to `connectionId` — the Accounting page's "Ready to push" batch
 * list. A document with no usable total (normalizeBillFromDocument would refuse it, same check the
 * single-document push action already applies) is excluded: it can't be pushed either way, so it
 * doesn't belong on a "ready to push" list — but the caller can still tell the reader how many
 * were held back and why, via `droppedCount`. */
export async function listReadyToPushDocuments(workspaceId: string, connectionId: string): Promise<ReadyToPushResult> {
  const [documents, pushes] = await Promise.all([
    listWorkspaceDocuments(workspaceId, { stage: "approved" }),
    listWorkspaceIntegrationPushes(workspaceId),
  ])
  const succeededDocumentIds = new Set(
    pushes.filter((push) => push.connectionId === connectionId && push.status === "succeeded").map((push) => push.documentId)
  )
  const results: ReadyToPushDocument[] = []
  let droppedCount = 0
  for (const doc of documents) {
    if (!isPushableDocument(doc) || succeededDocumentIds.has(doc.id)) continue
    const templateCode = doc.template?.code ?? null
    const reviewedData = (doc.reviewedData as Record<string, unknown> | null) ?? (doc.rawExtraction as Record<string, unknown> | null) ?? {}
    try {
      const bill = normalizeBillFromDocument({ documentId: doc.id, filename: doc.filename, templateCode, reviewedData })
      const coding = (doc.codingData as Record<string, unknown> | null) ?? {}
      const category = asScalarString(coding.account) ?? asScalarString(reviewedData.category) ?? "Uncategorized"
      results.push({ id: doc.id, filename: doc.filename, vendorName: bill.vendorName, total: bill.total, currencyCode: bill.currencyCode, category, docType: doc.docType ?? null })
    } catch {
      // no usable total — not push-ready
      droppedCount += 1
    }
  }
  return { documents: results, droppedCount }
}

export type AffectedBillLineChange = { index: number; oldAccountExternalId: string }

export type AffectedBillRow = {
  id: string
  filename: string
  vendorName: string
  total: number
  currencyCode: string | null
  receivedAt: Date
  /** "paid" when Document.paymentStatus is "paid" (documentStage's own precedence — a paid bill
   * is reported paid regardless of push status); otherwise "posted" (a succeeded push exists). A
   * bill can only be affected at all if one of these is true — see the where-clause below. */
  ledgerFact: "posted" | "paid"
  externalBillId: string | null
  /** Every line on this document whose codingData.items[].account_external_id still matches the
   * old account — the "N lines → {new account}" Change-column count, and the index set
   * updateSelectedBillAccountsAction resends to the provider. */
  lines: AffectedBillLineChange[]
}

/** Screen 1's "N bills already posted" query (#430) — reviewed documents on `connectionId` whose
 * `codingData.items` still carries `oldAccountExternalId` on at least one line, and whose ledger
 * fact (`lib/documents/stages.ts` precedence) is posted or paid. Excludes a document the Owner has
 * already dismissed via "Leave them" for this exact old account (`accountCorrectionDismissedAt` +
 * `accountCorrectionDismissedFromAccountId`) — a *later* correction (a different old account) is
 * not excluded, since dismissing one correction doesn't dismiss the next.
 *
 * Filters in JS rather than a Prisma JSON-path query: `codingData.items` is a JSON array and the
 * match is "does any element have this key/value", which Prisma's JSON filters don't express
 * portably — the candidate set (reviewed + succeeded-push-to-this-connection OR paid) is already
 * small per workspace, so an in-process filter is simplest and matches listReadyToPushDocuments's
 * existing pattern of filtering pushed documents in JS. */
export async function findBillsAffectedByAccountChange(workspaceId: string, connectionId: string, oldAccountExternalId: string): Promise<AffectedBillRow[]> {
  const [pushes, candidates] = await Promise.all([
    listWorkspaceIntegrationPushes(workspaceId),
    prisma.document.findMany({
      where: { workspaceId, status: "reviewed", codingData: { not: Prisma.JsonNull } },
      select: { id: true, filename: true, receivedAt: true, reviewedData: true, rawExtraction: true, codingData: true, paymentStatus: true, baseCurrencyTotal: true, accountCorrectionDismissedAt: true, accountCorrectionDismissedFromAccountId: true },
    }),
  ])
  const succeededByDocumentId = new Map(pushes.filter((p) => p.connectionId === connectionId && p.status === "succeeded").map((p) => [p.documentId, p]))
  const results: AffectedBillRow[] = []
  for (const doc of candidates) {
    const push = succeededByDocumentId.get(doc.id)
    const ledgerFact: "posted" | "paid" | null = doc.paymentStatus === "paid" ? "paid" : push ? "posted" : null
    if (!ledgerFact) continue
    if (doc.accountCorrectionDismissedAt && doc.accountCorrectionDismissedFromAccountId === oldAccountExternalId) continue
    const coding = (doc.codingData as Record<string, unknown> | null) ?? {}
    const items = Array.isArray(coding.items) ? (coding.items as Array<{ account_external_id?: string | null }>) : []
    const lines: AffectedBillLineChange[] = []
    items.forEach((item, index) => { if (item.account_external_id === oldAccountExternalId) lines.push({ index, oldAccountExternalId }) })
    if (!lines.length) continue
    const reviewedData = (doc.reviewedData as Record<string, unknown> | null) ?? (doc.rawExtraction as Record<string, unknown> | null) ?? {}
    const vendorName = (typeof reviewedData.vendor === "string" && reviewedData.vendor) || (typeof reviewedData.merchant === "string" && reviewedData.merchant) || "Unknown supplier"
    const total = doc.baseCurrencyTotal !== null ? Number(doc.baseCurrencyTotal) : (typeof reviewedData.total === "number" ? reviewedData.total : 0)
    const currencyCode = typeof reviewedData.currency_code === "string" ? reviewedData.currency_code : null
    results.push({ id: doc.id, filename: doc.filename, vendorName, total, currencyCode, receivedAt: doc.receivedAt, ledgerFact, externalBillId: push?.externalBillId ?? null, lines })
  }
  return results
}

/** Screen 1/3's "Leave them" (#430) — marks the given documents as resolved-without-updating for
 * this specific old account, so `findBillsAffectedByAccountChange` stops surfacing them until (if
 * ever) a further correction targets a different old account. Idempotent: re-running on an
 * already-dismissed document just rewrites the same flag. */
export async function dismissAccountCorrectionForDocuments(workspaceId: string, documentIds: string[], oldAccountExternalId: string): Promise<void> {
  if (!documentIds.length) return
  await prisma.document.updateMany({
    where: { workspaceId, id: { in: documentIds } },
    data: { accountCorrectionDismissedAt: new Date(), accountCorrectionDismissedFromAccountId: oldAccountExternalId },
  })
}

/** Screen 1/2's "Update N bills in {Provider}" (#430) — stamps the corrected account onto every
 * matching line of `codingData.items` (account_source becomes "manual": a person, via the Owner's
 * bulk action or the Detail pane, chose this) and clears any prior dismissal for this document,
 * since a successful update supersedes a "Leave them" decision. Called once per document AFTER the
 * provider write has already succeeded (lib/integrations/{quickbooks,xero}/client.ts's
 * updateBillAccounts) — this only updates DocuBite's own record of the fact. */
export async function recordAccountCorrectionApplied(workspaceId: string, documentId: string, oldAccountExternalId: string, newAccountExternalId: string): Promise<void> {
  const doc = await prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { codingData: true } })
  if (!doc) return
  const coding = (doc.codingData as Record<string, unknown> | null) ?? {}
  const items = Array.isArray(coding.items) ? (coding.items as Array<Record<string, unknown>>) : []
  const nextItems = items.map((item) => (item.account_external_id === oldAccountExternalId ? { ...item, account_external_id: newAccountExternalId, account_source: "manual" } : item))
  await prisma.document.update({
    where: { id: documentId },
    data: { codingData: { ...coding, items: nextItems } as Prisma.InputJsonValue, accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null },
  })
}

/** Screen 2's single-document Detail-pane Account edit (#430) — unlike `recordAccountCorrectionApplied`
 * (which retargets every line still on one old account, for the list/rule path), this writes each
 * line's account independently by index, since a person editing one bill by hand may pick a
 * different new account per line. Called once, after the provider write has already succeeded, and
 * never writes a `SupplierAccountRule` — this path is scoped to the one bill (spec §Screen 2: "This
 * path never teaches the Supplier rule"). */
export async function recordDocumentLineAccountsCorrected(workspaceId: string, documentId: string, changes: { index: number; newAccountExternalId: string }[]): Promise<void> {
  const doc = await prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { codingData: true } })
  if (!doc) return
  const coding = (doc.codingData as Record<string, unknown> | null) ?? {}
  const items = Array.isArray(coding.items) ? (coding.items as Array<Record<string, unknown>>) : []
  const byIndex = new Map(changes.map((c) => [c.index, c.newAccountExternalId]))
  const nextItems = items.map((item, index) => (byIndex.has(index) ? { ...item, account_external_id: byIndex.get(index), account_source: "manual" } : item))
  await prisma.document.update({
    where: { id: documentId },
    data: { codingData: { ...coding, items: nextItems } as Prisma.InputJsonValue },
  })
}

/** Which of the given documents currently have a queued/processing DocumentProcessingJob — what
 * the pipeline Inbox tab's inline spinner (documentStage's `hasActiveJob`) is driven by. */
export async function activeJobDocumentIds(workspaceId: string, documentIds: string[]): Promise<Set<string>> {
  if (!documentIds.length) return new Set()
  const jobs = await prisma.documentProcessingJob.findMany({ where: { workspaceId, documentId: { in: documentIds }, status: { in: ["queued", "processing"] } }, select: { documentId: true } })
  return new Set(jobs.map((job) => job.documentId).filter((id): id is string => id !== null))
}

/** Archives/unarchives a batch of documents — the pipeline's "Move to Archive" / "Restore" bulk
 * action. A separate axis from `status` (see lib/documents/stages.ts), so this never touches
 * status/reviewedData/confidence — restoring a document lands it back exactly where its status
 * already placed it. */
export async function setDocumentsArchived(workspaceId: string, documentIds: string[], archived: boolean) {
  const result = await prisma.document.updateMany({ where: { workspaceId, id: { in: documentIds.slice(0, 100) } }, data: { archivedAt: archived ? new Date() : null } })
  return { updated: result.count }
}

/** Sets/clears the pipeline list's manual "look at this" flag. Attributable like a transcript
 * edit: flaggedAt and flaggedById are set or cleared together (see the schema's CHECK). */
export async function setDocumentsFlagged(workspaceId: string, documentIds: string[], flagged: boolean, actorId: string) {
  const result = await prisma.document.updateMany({ where: { workspaceId, id: { in: documentIds.slice(0, 100) } }, data: flagged ? { flaggedAt: new Date(), flaggedById: actorId } : { flaggedAt: null, flaggedById: null } })
  return { updated: result.count }
}

/** Fire-and-forget: diffs old vs new field values and records each real scalar correction (WP1.3's
 * few-shot memory). Only scalar (string/number/boolean) values are recorded — an array field like
 * line_items is not a "wrong value, corrected value" pair in any useful sense for a prompt example.
 * Never awaited by callers past the point their own write already committed: a missed correction
 * costs future prompt quality, never correctness of the write it rode in on. */
function recordFieldCorrectionsFromDiff(input: { workspaceId: string; templateCode: string | null; oldValues: Record<string, unknown>; newValues: Record<string, unknown> }): void {
  if (!input.templateCode) return
  const templateCode = input.templateCode
  const supplierField = SUPPLIER_FIELD_BY_TEMPLATE[templateCode]
  const supplier = supplierField ? asScalarString(input.newValues[supplierField]) ?? asScalarString(input.oldValues[supplierField]) : null

  let anyRealCorrection = false
  for (const [fieldKey, oldValue] of Object.entries(input.oldValues)) {
    const wrongValue = asScalarString(oldValue)
    if (wrongValue === null) continue
    const newValue = asScalarString(input.newValues[fieldKey])
    if (newValue === null || newValue === wrongValue) continue
    anyRealCorrection = true
    recordFieldCorrection({ workspaceId: input.workspaceId, templateCode, fieldKey, supplier, wrongValue, correctedValue: newValue })
      .catch((error) => console.error("[documents] failed to record field correction:", error instanceof Error ? error.message : error))
  }
  // A1.1: any real correction resets this supplier's clean streak — the current threshold
  // isn't safe yet for this vendor. Fire-and-forget.
  if (anyRealCorrection && supplier) {
    resetSupplierStreak(input.workspaceId, supplier)
      .catch((error) => console.error("[documents] failed to reset supplier streak:", error instanceof Error ? error.message : error))
  }
}

function asScalarString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return null
}

/** #429: resolves each reviewed line's ledger account once, at the point Save review runs — the
 * same "human confirms this document" trigger the pre-#429 category chain ran at. Null when there
 * is no connected accounting connection (nothing to resolve against yet); the resulting rows are
 * stamped onto `codingData.items`, read back by the Detail pane, the push actions (as
 * `lineAccounts`), and the queue eligibility check. A document coded before the connection existed
 * (`usesLegacyAccountChain`) keeps resolving through the pre-connection CategoryAccountMapping
 * chain rather than a supplier-rule/Default chain that didn't exist when it was coded. */
export async function resolveDocumentCodingItems(input: {
  workspaceId: string
  vendorName: string | null
  category: string | null
  codingSource: string | null
  codedAt: Date
  lineCount: number
}): Promise<LineAccountRow[] | null> {
  if (!config.integrations.enabled) return null
  const connection = await prisma.integrationConnection.findFirst({
    where: { workspaceId: input.workspaceId, status: "connected" },
    select: { id: true, createdAt: true, defaultExpenseAccountId: true, defaultExpenseAccountGuessed: true },
  })
  if (!connection) return null
  const lineCount = Math.max(input.lineCount, 1)
  if (usesLegacyAccountChain(input.codingSource, input.codedAt, connection.createdAt)) {
    if (!connection.defaultExpenseAccountId) return null
    const [mappings, inferredMap] = await Promise.all([
      listCategoryAccountMappings(input.workspaceId, connection.id),
      getCategoryAccountMap(input.workspaceId, connection.id),
    ])
    const accountExternalId = resolveCategoryAccount(mappings, input.category, inferredMap, connection.defaultExpenseAccountId)
    return resolveDocumentLineAccounts(lineCount, { accountExternalId, accountSource: null })
  }
  const normalizedVendor = input.vendorName ? normalizeSupplierName(input.vendorName) : ""
  const rule = normalizedVendor
    ? await prisma.supplierAccountRule.findFirst({ where: { connectionId: connection.id, supplierName: normalizedVendor }, select: { accountExternalId: true } })
    : null
  // #429 archived-account fallback: a supplier rule or the connection Default can point at an
  // AccountingEntity a person later deactivated in the provider. Check both candidates' activity
  // in one query rather than trusting either id blindly.
  const candidateIds = [rule?.accountExternalId, connection.defaultExpenseAccountId].filter((id): id is string => Boolean(id))
  const activeAccounts = candidateIds.length
    ? await prisma.accountingEntity.findMany({ where: { connectionId: connection.id, entityType: "account", externalId: { in: candidateIds }, active: true }, select: { externalId: true } })
    : []
  const activeIds = new Set(activeAccounts.map((account) => account.externalId))
  const ruleAccountId = rule?.accountExternalId ?? null
  const ruleAccountActive = ruleAccountId ? activeIds.has(ruleAccountId) : false
  const ruleArchivedFallback = Boolean(ruleAccountId) && !ruleAccountActive
  // An archived Default is not "fall back further" — there is nothing left to fall back to — so
  // it resolves like no Default at all, and the existing "every line has an Account" eligibility
  // check (lib/integration-push-selection.ts) blocks posting the same way a missing Default does.
  const defaultAccountId = connection.defaultExpenseAccountId && activeIds.has(connection.defaultExpenseAccountId)
    ? connection.defaultExpenseAccountId
    : null
  const resolution = resolveLineAccount({
    supplierRuleAccountId: ruleAccountActive ? ruleAccountId : null,
    defaultAccountId,
    defaultAccountGuessed: connection.defaultExpenseAccountGuessed,
  })
  const rows = resolveDocumentLineAccounts(lineCount, resolution)
  return ruleArchivedFallback ? rows.map((row) => ({ ...row, account_archived_fallback: true })) : rows
}

export type AccountOption = { externalId: string; code: string | null; name: string }

// #429: same map as lib/finance/actions.ts's push-copy PROVIDER_LABELS and
// components/integrations/integrations-manager.tsx's connect-flow one — every provider gets an
// explicit label, duplicated per call site rather than shared, matching that existing precedent.
const PROVIDER_LABELS: Record<string, string> = { quickbooks: "QuickBooks", xero: "Xero", sage: "Sage" }

/** #429 step 5: everything the Detail pane's per-line Account `<select>` needs beyond what
 * `codingData.items` (the resolved rows) already carries — the pickable chart of accounts, the
 * vendor's existing `SupplierAccountRule` account (so the pane can tell "this line already
 * matches Acme's usual" from "picking this becomes Acme's usual"), and the provider's display
 * name for the archived-account/chart-sync copy. `null` when integrations are off or the
 * workspace has no connected provider — the caller renders the plain (non-bill) table in that
 * case, same guard as `resolveDocumentCodingItems`. */
export async function getBillAccountPickerData(workspaceId: string, vendorName: string | null): Promise<{
  accountOptions: AccountOption[]
  supplierRuleAccountId: string | null
  providerName: string | null
} | null> {
  if (!config.integrations.enabled) return null
  const connection = await prisma.integrationConnection.findFirst({ where: { workspaceId, status: "connected" }, select: { id: true, provider: true } })
  if (!connection) return null
  const normalizedVendor = vendorName ? normalizeSupplierName(vendorName) : ""
  const [entities, rule] = await Promise.all([
    listAccountingEntities(workspaceId, "account"),
    normalizedVendor
      ? prisma.supplierAccountRule.findFirst({ where: { connectionId: connection.id, supplierName: normalizedVendor }, select: { accountExternalId: true } })
      : Promise.resolve(null),
  ])
  return {
    accountOptions: entities.map((entity) => ({ externalId: entity.externalId, code: entity.code, name: entity.name })),
    supplierRuleAccountId: rule?.accountExternalId ?? null,
    providerName: PROVIDER_LABELS[connection.provider] ?? connection.provider,
  }
}

/** #429: learns a supplier's usual expense account when a document is approved — the account
 * resolved onto the line with the largest amount (they are currently all the same account, per
 * resolveLineAccount's one-account-per-document scope, but this reads amounts rather than
 * assuming that so it keeps working if that scope ever loosens). Upserts
 * `SupplierAccountRule[connectionId, supplierName]`, refreshing `lastUsedAt` on every re-approval
 * of the same supplier so "Forget" (Accounting page) always deletes a genuinely stale row.
 * Fire-and-forget like the other approval-signal writers in models/suppliers.ts: a missed rule
 * only costs a future pre-fill, never the approval it rode in on. Skips legacy-chain resolutions
 * (`account_source: null`) — those didn't come from the supplier/Default chain this rule feeds. */
export type SupplierAccountRuleChange = { connectionId: string; oldAccountExternalId: string; newAccountExternalId: string }

/** Returns the old→new account change when this approval retargeted an existing rule (never on a
 * first-time create), so the caller (#430 Screen 1) can check for bills still posted under the
 * old account. */
export async function learnSupplierAccountRuleFromApproval(workspaceId: string, documentId: string): Promise<SupplierAccountRuleChange | null> {
  try {
    const document = await prisma.document.findFirst({
      where: { id: documentId, workspaceId },
      select: { reviewedData: true, codingData: true },
    })
    if (!document) return null
    const reviewedData = (document.reviewedData as Record<string, unknown> | null) ?? {}
    const vendorName = (typeof reviewedData.vendor === "string" && reviewedData.vendor) || (typeof reviewedData.merchant === "string" && reviewedData.merchant) || null
    if (!vendorName?.trim()) return null
    const coding = (document.codingData as Record<string, unknown> | null) ?? {}
    const items = Array.isArray(coding.items) ? (coding.items as LineAccountRow[]) : []
    if (!items.length) return null
    const lineItems = Array.isArray(reviewedData.line_items) ? (reviewedData.line_items as Array<Record<string, unknown>>) : []
    let bestIndex = -1
    let bestAmount = -Infinity
    items.forEach((item, index) => {
      if (!item.account_external_id || !item.account_source) return
      const amount = typeof lineItems[index]?.amount === "number" ? (lineItems[index].amount as number) : 0
      if (bestIndex === -1 || amount > bestAmount) { bestIndex = index; bestAmount = amount }
    })
    if (bestIndex === -1) return null
    const accountExternalId = items[bestIndex].account_external_id
    if (!accountExternalId) return null
    const connection = await prisma.integrationConnection.findFirst({ where: { workspaceId, status: "connected" }, select: { id: true } })
    if (!connection) return null
    const supplierName = normalizeSupplierName(vendorName)
    const existing = await prisma.supplierAccountRule.findUnique({
      where: { connectionId_supplierName: { connectionId: connection.id, supplierName } },
      select: { accountExternalId: true },
    })
    await prisma.supplierAccountRule.upsert({
      where: { connectionId_supplierName: { connectionId: connection.id, supplierName } },
      create: { workspaceId, connectionId: connection.id, supplierName, accountExternalId, lastUsedAt: new Date() },
      update: { accountExternalId, lastUsedAt: new Date() },
    })
    // Only a genuine retarget of an existing rule is a #430 trigger — a first-time create has no
    // bills posted under "the old account" because there wasn't one.
    if (existing && existing.accountExternalId && existing.accountExternalId !== accountExternalId) {
      return { connectionId: connection.id, oldAccountExternalId: existing.accountExternalId, newAccountExternalId: accountExternalId }
    }
    return null
  } catch (error) {
    console.error("[documents] failed to learn supplier account rule:", error instanceof Error ? error.message : error)
    return null
  }
}

/** #429: bumps `lastUsedAt` when a push actually posts using a supplier's learned account, so
 * "Forget" on the Accounting page judges staleness by real use, not just how long ago the rule
 * was learned. Only bumps when the pushed account still matches the rule's account — a document
 * whose vendor no longer matches this rule (renamed, or the rule was retargeted) should not keep
 * a stale rule looking fresh. Fire-and-forget, same rationale as the writers above. */
export async function touchSupplierAccountRuleUsage(workspaceId: string, connectionId: string, vendorName: string | null, accountExternalId: string | null): Promise<void> {
  if (!vendorName?.trim() || !accountExternalId) return
  try {
    await prisma.supplierAccountRule.updateMany({
      where: { workspaceId, connectionId, supplierName: normalizeSupplierName(vendorName), accountExternalId },
      data: { lastUsedAt: new Date() },
    })
  } catch (error) {
    console.error("[documents] failed to bump supplier account rule usage:", error instanceof Error ? error.message : error)
  }
}

export async function updateDocumentReview(input: { workspaceId: string; documentId: string; reviewedData: Record<string, unknown>; actorId: string }) {
  const document = await getWorkspaceDocument(input.workspaceId, input.documentId)
  if (!document) throw new Error("document_not_found")
  const fields = parseTemplateFields(document.fieldSnapshot)
  const reviewedData = validateDocumentValues(fields, input.reviewedData)
  const missing = findMissingRequiredFields(fields, reviewedData)
  const coding = (document.codingData as Record<string, unknown> | null) ?? {}
  const hasDocumentType = coding.documentType === "expense" || coding.documentType === "sale" || coding.documentType === "bank_statement"
  if (!hasDocumentType) missing.push("document_type")
  // #360: Direction is retired — there is no separate confirm step left before Save review, so
  // Save review itself is now the one human act that confirms the category for invoice/receipt/PO
  // (`hasDirectionField`), the same way `setDocumentTypeAction` used to. Without this, a document
  // the classifier wasn't confident about (`categoryConfirmed` never set true) would stay
  // unpushable forever (`isCategoryConfirmed`, read by readiness/autopublish/integration push).
  const newlyConfirmedCategory = hasDirectionField(resolveDocType(document)) && coding.categoryConfirmed !== true
  const vendorName = (typeof reviewedData.vendor === "string" && reviewedData.vendor) || (typeof reviewedData.merchant === "string" && reviewedData.merchant) || null
  const category = typeof coding.account === "string" ? coding.account : null
  const lineCount = Array.isArray(reviewedData.line_items) ? reviewedData.line_items.length : 0
  const items = await resolveDocumentCodingItems({
    workspaceId: input.workspaceId, vendorName, category, codingSource: document.codingSource, codedAt: document.receivedAt, lineCount,
  })
  const codingUpdates: Record<string, unknown> = {}
  if (newlyConfirmedCategory) codingUpdates.categoryConfirmed = true
  if (items) codingUpdates.items = items
  const nextCoding = Object.keys(codingUpdates).length ? { ...coding, ...codingUpdates } : null
  // Re-project the structured spine from the values a human signed off on. Source is "manual"
  // because these are now reviewed values, but the per-field scores are carried over from the
  // extraction rather than being reset to 1: a bulk "mark reviewed" does not mean somebody read
  // every field, and claiming certainty nobody asserted would make the confidence signal useless.
  const priorConfidence = ((document.confidence as Record<string, unknown> | null)?.fieldConfidence as Record<string, number> | null) ?? null
  const rows = projectDocumentFields({ fields, values: reviewedData, confidence: priorConfidence, provenance: document.provenance as DocumentProvenance | null, source: "manual" })
  let webhookQueued = false
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.document.update({ where: { id: document.id }, data: { reviewedData: reviewedData as Prisma.InputJsonValue, searchText: searchableText(reviewedData, document.filename), confidence: { missingRequiredFields: missing, manuallyReviewed: true } as Prisma.InputJsonValue, reviewedAt: new Date(), status: missing.length ? "needs_review" : "reviewed", ...(nextCoding ? { codingData: nextCoding as Prisma.InputJsonValue } : {}) } })
    await recordDocumentAudit({ workspaceId: input.workspaceId, documentId: document.id, actorId: input.actorId, type: "document_reviewed" }, tx)
    await replaceDocumentFieldValues({ workspaceId: input.workspaceId, documentId: document.id, fileId: document.fileId, templateCode: document.template?.code ?? null, rows }, tx)
    const emitted = await emitWorkspaceEvent(tx, {
      workspaceId: input.workspaceId, type: missing.length ? "document.needs_review" : "document.reviewed", createdAt: new Date(),
      document: { id: updated.id, filename: updated.filename, status: updated.status, receivedAt: updated.receivedAt, reviewedData: updated.reviewedData, templateCode: document.template?.code ?? null, confidence: updated.confidence },
    })
    webhookQueued = emitted.queued > 0
    return updated
  }, { timeout: 20_000 })
  recordFieldCorrectionsFromDiff({
    workspaceId: input.workspaceId, templateCode: document.template?.code ?? null,
    oldValues: (document.reviewedData as Record<string, unknown> | null) ?? (document.rawExtraction as Record<string, unknown> | null) ?? {},
    newValues: reviewedData,
  })
  // Human review is the key integration trigger — a reviewed document is what a connector pushes.
  if (webhookQueued) await kickWebhookDrain()
  // FX conversion runs AFTER the review commit rather than inside it: a network fetch to
  // Frankfurter must not extend the review transaction (or hold locks while waiting on it), and
  // a failure here must not roll the review back — the document is reviewed either way, its
  // conversion just moves to "pending" until a retry succeeds.
  await applyFxToDocument(document.id).catch(() => {})
  // Approval IS the decision to sync: no separate "Push to Accounting" click. Runs after FX so a
  // just-converted document ships with its base-currency total; the sync's own gates (connection,
  // pushable type, FX landed) decide whether anything actually enqueues. Dynamic import to keep
  // this module's import graph clean for vitest.
  if (!missing.length) {
    const { syncOnApproval } = await import("@/lib/automation/autopublish")
    await syncOnApproval(input.workspaceId, document.id, input.actorId).catch(() => {})
  }
  return result
}

/** Removes one field's source pin from a document's provenance record, returning the partial
 * update to merge into a document.update — or an empty object when there is nothing to clear, so
 * a document that never carried provenance is left untouched. */
function clearFieldProvenance(provenance: unknown, fieldKey: string): { provenance?: Prisma.InputJsonValue } {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return {}
  const prev = provenance as { fields?: Record<string, unknown>; items?: Record<string, unknown> }
  const fields = { ...(prev.fields ?? {}) }
  const items = { ...(prev.items ?? {}) }
  if (!(fieldKey in fields) && !(fieldKey in items)) return {}
  delete fields[fieldKey]
  delete items[fieldKey]
  return { provenance: { ...prev, fields, items } as Prisma.InputJsonValue }
}

/** actorId is nullable because a link-shared editor has no account of their own; the audit
 * event still records that the edit happened. */
export async function updateDocumentField(input: { workspaceId: string; documentId: string; fieldKey: string; value: unknown; actorId: string | null }) {
  const document = await getWorkspaceDocument(input.workspaceId, input.documentId)
  if (!document) throw new Error("document_not_found")
  if (document.status === "queued" || document.status === "failed") throw new Error("document_not_ready")
  const fields = parseTemplateFields(document.fieldSnapshot)
  if (!fields.some((f) => f.key === input.fieldKey)) throw new Error("unknown_field")
  const current = (document.reviewedData as Record<string, unknown> | null) ?? (document.rawExtraction as Record<string, unknown> | null) ?? {}
  const candidate = { ...current }
  if (input.value === null || input.value === "") { delete candidate[input.fieldKey] } else { candidate[input.fieldKey] = input.value }
  const reviewedData = validateDocumentValues(fields, candidate)
  const missing = findMissingRequiredFields(fields, reviewedData)
  const prevConfidence = (document.confidence as Record<string, unknown> | null) ?? {}
  const prevFieldConfidence = (prevConfidence.fieldConfidence as Record<string, number> | null) ?? {}
  const nextFieldConfidence = { ...prevFieldConfidence, [input.fieldKey]: 1 }
  const confidence = { ...prevConfidence, missingRequiredFields: missing, fieldConfidence: nextFieldConfidence } as Prisma.InputJsonValue
  // A hand-edited value no longer came from the document, so its source pin is dropped — a stale
  // highlight over the old printed value would be worse than none.
  const provenanceUpdate = clearFieldProvenance(document.provenance, input.fieldKey)
  // Re-project the whole document rather than the one edited field: the projection is a pure
  // function of the values, so replacing it wholesale is both simpler and immune to the drift a
  // targeted patch would eventually introduce. The edited field's confidence is 1 (a person typed
  // it) and its provenance was just cleared above, so it projects with no source pin.
  const nextProvenance = ("provenance" in provenanceUpdate ? provenanceUpdate.provenance : document.provenance) as DocumentProvenance | null
  const rows = projectDocumentFields({ fields, values: reviewedData, confidence: nextFieldConfidence, provenance: nextProvenance, source: "manual" })
  const updated = await prisma.$transaction(async (tx) => {
    const document_ = await tx.document.update({ where: { id: document.id }, data: { reviewedData: reviewedData as Prisma.InputJsonValue, searchText: searchableText(reviewedData, document.filename), confidence, ...provenanceUpdate } })
    await recordDocumentAudit({ workspaceId: input.workspaceId, documentId: document.id, actorId: input.actorId, type: "document_field_edited" }, tx)
    await replaceDocumentFieldValues({ workspaceId: input.workspaceId, documentId: document.id, fileId: document.fileId, templateCode: document.template?.code ?? null, rows }, tx)
    return document_
  }, { timeout: 20_000 })
  recordFieldCorrectionsFromDiff({ workspaceId: input.workspaceId, templateCode: document.template?.code ?? null, oldValues: current, newValues: reviewedData })
  await track("document_correction_saved", { documentId: document.id, fieldCount: 1 }, { workspaceId: input.workspaceId, actorId: input.actorId })
  await track("field_corrected", { documentId: document.id, fieldKey: input.fieldKey }, { workspaceId: input.workspaceId, actorId: input.actorId })
  return { document: updated, missingRequiredFields: missing }
}

/** Sets a document's coding (account/tax code/cost centre — whatever keys the workspace's
 * supplier rules use) directly, bypassing rule matching. Written by the finance agent's
 * set_document_coding act tool (Part 5c) when a person accepts the proposed coding, and available
 * to any future manual-coding UI. Deliberately touches ONLY `codingData` — never reviewedData,
 * confidence, or provenance, which is what `updateDocumentField` guards; coding is classification
 * metadata layered on top of extraction, not a value read off the document, so it has none of
 * that machinery to keep in sync. `appliedRuleId` is left untouched: this is coding a person (or
 * the agent, on their behalf) chose, not a rule matching, so it must not look like one did. */
export async function setDocumentCoding(input: { workspaceId: string; documentId: string; codingData: Record<string, string | number>; actorId: string }) {
  const document = await prisma.document.findFirst({
    where: { id: input.documentId, workspaceId: input.workspaceId },
    select: { id: true, codingData: true, codingSource: true, template: { select: { code: true } } },
  })
  if (!document) throw new Error("document_not_found")

  const priorCodingData = (document.codingData as Record<string, unknown> | null) ?? {}
  const priorSource = document.codingSource

  const updated = await prisma.$transaction(async (tx) => {
    const document_ = await tx.document.update({
      where: { id: document.id },
      data: { codingData: input.codingData as Prisma.InputJsonValue, codingSource: "manual", codingConfidence: null },
    })
    await recordDocumentAudit({ workspaceId: input.workspaceId, documentId: document.id, actorId: input.actorId, type: "document_coding_set", detail: { codingData: input.codingData } }, tx)
    return document_
  })

  if (priorSource === "ai") {
    const templateCode = document.template?.code
    if (templateCode) {
      const reviewedData = (updated.reviewedData as Record<string, unknown> | null) ?? {}
      const supplierField = SUPPLIER_FIELD_BY_TEMPLATE[templateCode]
      const supplier = supplierField ? asScalarString(reviewedData[supplierField]) : null

      let changedCount = 0
      for (const [key, newValue] of Object.entries(input.codingData)) {
        const oldValue = asScalarString(priorCodingData[key])
        const newStr = asScalarString(newValue)
        if (oldValue !== null && newStr !== null && oldValue !== newStr) {
          changedCount++
          recordCodingCorrection({ workspaceId: input.workspaceId, templateCode, codingKey: key, supplier, wrongValue: oldValue, correctedValue: newStr })
            .catch((error) => console.error("[documents] failed to record coding correction:", error instanceof Error ? error.message : error))
        }
      }

      if (changedCount > 0) {
        await recordDocumentAudit({ workspaceId: input.workspaceId, documentId: document.id, actorId: input.actorId, type: "ai_coding.overridden" })
        await track("ai_coding_overridden", { documentId: document.id, fieldCount: changedCount }, { workspaceId: input.workspaceId, actorId: input.actorId })
      }
    }
  }

  return updated
}

export async function markDocumentsReviewed(workspaceId: string, documentIds: string[], actorId: string) {
  const capped = documentIds.slice(0, 100)
  let reviewed = 0
  let needsReview = 0
  const reviewedIds: string[] = []
  for (const documentId of capped) {
    const doc = await getWorkspaceDocument(workspaceId, documentId)
    if (!doc || doc.status === "queued" || doc.status === "failed") continue
    const data = (doc.reviewedData as Record<string, unknown> | null) ?? (doc.rawExtraction as Record<string, unknown> | null) ?? {}
    try {
      await updateDocumentReview({ workspaceId, documentId, reviewedData: data, actorId })
      const fields = parseTemplateFields(doc.fieldSnapshot)
      const missing = findMissingRequiredFields(fields, validateDocumentValues(fields, data))
      if (missing.length) { needsReview++ } else { reviewed++; reviewedIds.push(documentId) }
    } catch { needsReview++ }
  }
  // reviewedIds is what the client-side "Undo" can send back to Review — the set that actually
  // moved off the Review stage this call. Held-back documents (missing required fields) never
  // left Review, so they aren't in this list.
  return { reviewed, needsReview, reviewedIds }
}

/** The Undo path for a pipeline bulk Approve: puts documents back on the Review stage by opening
 * a fresh ReviewTask on each one. Doesn't touch reviewedData or status; the stage predicate
 * (stageWhereClause("review") in this file) already treats `status: "reviewed"` + an open
 * ReviewTask as Review, so an open task is enough to land the row back where it started. The
 * task's `detail` says how it got there, so the reviewer looking at their queue knows this
 * wasn't a fresh AI flag. Idempotent-ish: a document that already has an open task is skipped
 * so a repeated Undo doesn't spawn duplicates. */
export async function sendDocumentsBackToReview(workspaceId: string, documentIds: string[], actorId: string) {
  const capped = documentIds.slice(0, 100)
  let updated = 0
  for (const documentId of capped) {
    const doc = await prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { id: true, status: true } })
    if (!doc) continue
    const existing = await prisma.reviewTask.findFirst({ where: { workspaceId, documentId, status: { in: ["open", "in_review"] } }, select: { id: true } })
    if (existing) { updated++; continue }
    await prisma.reviewTask.create({
      data: {
        workspaceId, documentId, reason: "manual", detail: "Sent back to Review from bulk approve — Undo",
        createdById: actorId, priority: 0,
      },
    })
    updated++
  }
  return { updated }
}

/** Lightweight status read for the extraction-progress poller. Capped because callers track
 * one upload batch, not the whole workspace. `searchable` reports whether the document has any
 * stored chunks yet — true once embedding has run — and is only computed when document search is
 * configured; with the feature off it is always false, so nothing downstream ever shows the chip.
 * `flaggedFields` names every field a reviewer should double-check: missing required fields plus
 * any field the model returned below the same LOW_CONFIDENCE threshold the sheet's amber tint
 * uses — so the same signal the grid already carries also reaches the extract panel's row list. */
export function flaggedFieldsFromConfidence(confidence: unknown): string[] {
  const record = (confidence as Record<string, unknown> | null) ?? null
  const missing = (record?.missingRequiredFields as string[] | null) ?? []
  const fieldConfidence = (record?.fieldConfidence as Record<string, number> | null) ?? {}
  const low = Object.entries(fieldConfidence).filter(([, score]) => typeof score === "number" && score < LOW_CONFIDENCE).map(([key]) => key)
  return [...new Set([...missing, ...low])]
}

export type DocumentReviewSummary = {
  supplier: string | null
  category: string
  total: string | null
  /** Pre-formatted converted total when the document is in a foreign currency AND its conversion
   * has succeeded — e.g. "≈ $108" alongside the "€100" the `total` field carries. Null when the
   * document is same-currency (nothing to convert) or when conversion is still pending (the UI
   * shows an "FX pending" chip instead). */
  converted: string | null
  /** True when the document IS in a foreign currency but conversion hasn't landed yet. The
   * library / pipeline list uses this to render the amber "FX pending" chip instead of a
   * `converted` string. */
  fxPending: boolean
}

/** What a reviewer needs to triage a to-review document at a glance, in place of its filename:
 * who it's from, what it's coded as, and how much. Read off the same fields the automation-rule
 * engine (SUPPLIER_FIELD_BY_TEMPLATE) and the spend-by-category analytics (codingData.account)
 * already treat as the supplier/category source of truth, so this agrees with those rather than
 * introducing a third convention.
 *
 * `workspaceBaseCurrency`, when provided, gates the converted-total string: without it we can't
 * know whether the document IS foreign-currency relative to this workspace. Callers that fetch
 * documents in a workspace context should pass it; callers that don't (a rare cross-workspace
 * report) get the extracted total only. */
export function summarizeDocumentForReview(doc: { reviewedData: unknown; codingData: unknown; template: { code: string } | null; baseCurrencyTotal?: unknown }, workspaceBaseCurrency: string | null = null): DocumentReviewSummary {
  const reviewed = (doc.reviewedData as Record<string, unknown> | null) ?? {}
  const coding = (doc.codingData as Record<string, unknown> | null) ?? {}
  const templateCode = doc.template?.code ?? ""
  const supplierField = SUPPLIER_FIELD_BY_TEMPLATE[templateCode]
  const supplier = supplierField ? asScalarString(reviewed[supplierField]) : null
  const category = asScalarString(coding.account) ?? asScalarString(reviewed.category) ?? "Uncategorized"
  const totalValue = reviewed.total
  const docCurrency = asScalarString(reviewed.currency_code)?.toUpperCase() ?? null
  const total = typeof totalValue === "number" ? formatDocumentTotal(totalValue, docCurrency) : null

  const base = workspaceBaseCurrency ? workspaceBaseCurrency.toUpperCase() : null
  const isForeign = Boolean(base && docCurrency && docCurrency !== base)
  const baseTotalRaw = doc.baseCurrencyTotal
  const baseTotal = baseTotalRaw !== null && baseTotalRaw !== undefined ? Number(baseTotalRaw) : null
  const converted = isForeign && base && baseTotal !== null && Number.isFinite(baseTotal)
    ? `≈ ${formatDocumentTotal(baseTotal, base)}`
    : null
  const fxPending = isForeign && converted === null

  return { supplier, category, total, converted, fxPending }
}

function formatDocumentTotal(value: number, currencyCode: string | null): string {
  if (currencyCode) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(value)
    } catch {
      // A currency code the model read off the document but Intl doesn't recognise — fall through
      // to a plain number rather than throwing the whole list.
    }
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

export async function getDocumentsStatus(workspaceId: string, documentIds: string[]) {
  if (!documentIds.length) return []
  const where = { workspaceId, id: { in: documentIds.slice(0, 50) } }
  // With document search off, skip the chunk-count join entirely and report searchable: false.
  if (!config.embeddings.enabled) {
    const rows = await prisma.document.findMany({ where, select: { id: true, status: true, errorCode: true, filename: true, confidence: true } })
    return rows.map(({ confidence, ...row }) => ({ ...row, searchable: false, indexing: false, flaggedFields: flaggedFieldsFromConfidence(confidence) }))
  }
  const rows = await prisma.document.findMany({
    where,
    select: {
      id: true, status: true, errorCode: true, filename: true, confidence: true,
      _count: { select: { chunks: true } },
      // Was implied — a poller had to guess indexing was still happening from "not searchable
      // yet" and a fixed tick budget. This makes it a fact: a queued/processing embed job exists,
      // full stop, rather than something inferred from the absence of a result.
      jobs: { where: { type: "embed", status: { in: ["queued", "processing"] } }, select: { id: true }, take: 1 },
    },
  })
  return rows.map(({ _count, jobs, confidence, ...row }) => ({ ...row, searchable: _count.chunks > 0, indexing: jobs.length > 0, flaggedFields: flaggedFieldsFromConfidence(confidence) }))
}

/** Deletes documents with their stored sources. Quota is deliberately not refunded: the
 * upload consumed processing work, and refunds would let one slot be recycled all month. */
export async function deleteWorkspaceDocuments(workspaceId: string, documentIds: string[], actorId: string) {
  const documents = await prisma.document.findMany({ where: { workspaceId, id: { in: documentIds.slice(0, 100) } }, select: { id: true, storageKey: true, filename: true } })
  let deleted = 0
  let anyQueued = false
  const deletingIds = new Set(documents.map((d) => d.id))
  for (const document of documents) {
    if (document.storageKey) {
      // Deliberately across every workspace: the question is whether this stored object is still
      // referenced by ANY document, and scoping it to this one would delete a blob another
      // workspace's document still points at. unscoped() is what says so — without it the guard
      // throws and takes the whole delete with it.
      const otherRefs = await unscoped(() => prisma.document.count({ where: { storageKey: document.storageKey, id: { notIn: [...deletingIds] } } }))
      if (otherRefs === 0) await deleteDocumentSource(document.storageKey).catch(() => {})
    }
    // The blocks sidecar (if any) sits under the same document prefix; drop it too. Best effort —
    // an absent sidecar is the common case.
    await deleteDocumentSource(documentBlocksKey(workspaceId, document.id)).catch(() => {})
    // Interactive form so document.deleted fans out in the same tx as the delete. The event carries
    // only id + filename (the row is gone), and its delivery row's documentId is null — no dangling FK.
    // Context fetched before the tx: recordDocumentAudit's getRequestAuditContext() reads next/headers(),
    // which only works outside a transaction callback (it is not a lazy Prisma query).
    const context = await getRequestAuditContext()
    // #51 auto-resolve: a duplicate gate whose winning bill is this one has lost its
    // counterpart; transition every such gate to resolved before the delete cascades
    // its own row away. Runs OUTSIDE the delete tx so its `gate.resolved` audit event
    // is durable even if the delete itself races or aborts — the underlying condition
    // (winner gone) is a fact from the moment we decide to delete, not the moment the
    // row disappears.
    await resolveDuplicateGatesAgainst(document.id).catch((error) => {
      // Never break a document delete for an audit-side transition — the gate row would
      // cascade-delete anyway; the missing `gate.resolved` event is a logged degradation,
      // not a data-integrity failure.
      console.error(`[gates] resolveDuplicateGatesAgainst failed for ${document.id}:`, error instanceof Error ? error.message : error)
    })
    await prisma.$transaction(async (tx) => {
      await tx.document.delete({ where: { id: document.id } })
      await tx.documentAuditEvent.create({ data: auditEventData({ workspaceId, actorId, type: "document_deleted" }, context) })
      const emitted = await emitWorkspaceEvent(tx, {
        workspaceId, type: "document.deleted", createdAt: new Date(),
        document: { id: document.id, filename: document.filename, deleted: true },
      })
      if (emitted.queued > 0) anyQueued = true
    })
    deleted++
  }
  if (anyQueued) await kickWebhookDrain()
  return { deleted }
}

/** Re-runs extraction for one document (the panel's re-process action). The AI quota flag
 * stays claimed, so a re-run never double-charges the workspace. */
export async function requeueDocumentExtraction(workspaceId: string, documentId: string) {
  const document = await prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { id: true, storageKey: true, templateVersion: { select: { fields: true } } } })
  if (!document) throw new Error("document_not_found")
  if (!document.storageKey) throw new Error("document_source_missing")
  const active = await prisma.documentProcessingJob.findFirst({ where: { workspaceId, documentId: document.id, status: { in: ["queued", "processing"] } }, select: { id: true } })
  if (active) throw new Error("document_already_processing")
  const context = await getRequestAuditContext()
  const [, job] = await prisma.$transaction([
    prisma.document.update({ where: { id: document.id }, data: { status: "queued", errorCode: null, ...(document.templateVersion ? { fieldSnapshot: document.templateVersion.fields as Prisma.InputJsonValue } : {}) } }),
    prisma.documentProcessingJob.create({ data: { workspaceId, documentId: document.id, type: "extract" } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId, documentId: document.id, type: "extraction_requeued" }, context) }),
  ])
  return job
}

/** A reviewer's paid/unpaid confirmation on one document — see the "paymentStatus" note on Document
 * in prisma/schema.prisma for why this exists separately from LedgerTransaction.paymentStatus.
 * Overwritable: a reviewer who confirmed "unpaid" can come back once the bill is settled and
 * confirm "paid" without anyone needing to touch the review task again — the gate in
 * models/review-tasks.ts only cares that a value exists, not which one, so this never blocks a
 * correction the way an idempotent "already confirmed" guard would. */
export async function setDocumentPaymentStatus(input: { workspaceId: string; documentId: string; status: PaidStatus; actorId: string }) {
  const document = await prisma.document.findFirst({ where: { id: input.documentId, workspaceId: input.workspaceId }, select: { id: true, paymentStatus: true } })
  if (!document) throw new Error("document_not_found")
  const context = await getRequestAuditContext()
  const now = new Date()
  const [updated] = await prisma.$transaction([
    prisma.document.update({
      where: { id: document.id },
      data: { paymentStatus: input.status, paymentConfirmedAt: now, paymentConfirmedById: input.actorId },
    }),
    prisma.documentAuditEvent.create({
      data: auditEventData({ workspaceId: input.workspaceId, documentId: document.id, actorId: input.actorId, type: "payment_status_confirmed", detail: { from: document.paymentStatus, to: input.status } }, context),
    }),
  ])
  return updated
}

/** Re-runs extraction for one document with adaptive line-item discovery forced on, even if the
 * global ADAPTIVE_EXTRACTION flag is off (the panel's "Re-extract adaptively" action). Resets
 * fieldSnapshot to the template's own version fields first, so a previously merged snapshot from an
 * earlier adaptive run does not compound into this one. */
export async function requeueAdaptiveExtraction(workspaceId: string, documentId: string) {
  const document = await prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { id: true, storageKey: true, templateVersionId: true, templateVersion: { select: { fields: true } } } })
  if (!document) throw new Error("document_not_found")
  if (!document.storageKey) throw new Error("document_source_missing")
  if (!document.templateVersion) throw new Error("document_has_no_template")
  const active = await prisma.documentProcessingJob.findFirst({ where: { workspaceId, documentId: document.id, status: { in: ["queued", "processing"] } }, select: { id: true } })
  if (active) throw new Error("document_already_processing")
  const context = await getRequestAuditContext()
  const [, job] = await prisma.$transaction([
    prisma.document.update({ where: { id: document.id }, data: { status: "queued", errorCode: null, adaptiveExtraction: true, fieldSnapshot: document.templateVersion.fields as Prisma.InputJsonValue } }),
    prisma.documentProcessingJob.create({ data: { workspaceId, documentId: document.id, type: "extract" } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId, documentId: document.id, type: "extraction_requeued" }, context) }),
  ])
  return job
}

export class DocumentCancellationBlockedError extends Error {
  constructor(public readonly paymentStatus: string) {
    super(`Cannot cancel a document that is already ${paymentStatus}`)
    this.name = "DocumentCancellationBlockedError"
  }
}

/** #220: terminal manual cancellation of an invoice. Independent of both the ReviewTask approval
 * chain and the ledger sync, following the `overrideGate()`/`writeAuditEvent` shape elsewhere in
 * this codebase (reason + attribution + audit event) even though this isn't a Gate. Hard-blocked
 * once the ledger sync reports the document Synced or Paid/Reconciled (see
 * models/ledger-payments.ts) — cancelling something the accounting provider already has a record
 * of would leave that record dangling with nothing on this side pointing at it. Auto-resolves any
 * still-open ReviewTask for the document, since there's nothing left to approve or reject once
 * cancelled; "rejected" is the closest existing terminal ReviewTaskStatus (there is no dedicated
 * "cancelled" task state). No un-cancel affordance — cancelledAt/cancelledReason/cancelledById
 * are set once and never cleared. */
export async function cancelDocument(input: { workspaceId: string; documentId: string; actorId: string; reason: string }): Promise<Document> {
  const reason = input.reason.trim()
  if (!reason) throw new Error("cancellation_reason_required")
  const document = await prisma.document.findFirst({ where: { id: input.documentId, workspaceId: input.workspaceId }, select: { id: true, cancelledAt: true } })
  if (!document) throw new Error("document_not_found")
  if (document.cancelledAt) throw new Error("document_already_cancelled")

  const paymentStatuses = await getDocumentPaymentStatuses(input.workspaceId, [document.id])
  const paymentStatus = paymentStatuses.get(document.id)?.paymentStatus?.toLowerCase() ?? null
  if (paymentStatus && ["posted", "paid", "reconciled"].includes(paymentStatus)) throw new DocumentCancellationBlockedError(paymentStatus)

  const context = await getRequestAuditContext()
  const now = new Date()
  const [updated] = await prisma.$transaction([
    prisma.document.update({ where: { id: document.id }, data: { cancelledAt: now, cancelledReason: reason, cancelledById: input.actorId } }),
    prisma.reviewTask.updateMany({ where: { workspaceId: input.workspaceId, documentId: document.id, status: { in: ["open", "in_review"] } }, data: { status: "rejected", resolvedAt: now } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, documentId: document.id, actorId: input.actorId, type: "invoice.cancelled", detail: { reason } }, context) }),
  ])
  return updated
}

export function documentDataForExport(document: Pick<Document, "filename" | "status" | "receivedAt" | "reviewedData">) {
  return { filename: document.filename, status: document.status, received_at: document.receivedAt.toISOString(), ...((document.reviewedData as Record<string, unknown> | null) || {}) }
}

/** Sets (or clears, on an empty string) the split-pane detail view's free-text note. */
export async function updateDocumentNote(workspaceId: string, documentId: string, note: string) {
  const trimmed = note.trim()
  await prisma.document.update({ where: { id: documentId, workspaceId }, data: { note: trimmed || null } })
  return { note: trimmed || null }
}

/** Merges exactly two documents on the pipeline list — the "duplicate scans of one invoice"
 * case. The earlier-received document survives; any field the survivor is missing is backfilled
 * from the other before it is deleted. Works across a `fileId` difference on purpose: dedup
 * (`@@unique([fileId, sha256])`) is per file, so a real duplicate uploaded into two different
 * files never trips it, and this is the tool for merging that pair by hand. */
export async function mergeDocuments(workspaceId: string, documentIds: [string, string], actorId: string) {
  const [a, b] = await Promise.all(documentIds.map((id) => getWorkspaceDocument(workspaceId, id)))
  if (!a || !b) throw new Error("document_not_found")
  const [survivor, loser] = a.receivedAt <= b.receivedAt ? [a, b] : [b, a]
  const survivorData = (survivor.reviewedData as Record<string, unknown> | null) ?? (survivor.rawExtraction as Record<string, unknown> | null) ?? {}
  const loserData = (loser.reviewedData as Record<string, unknown> | null) ?? (loser.rawExtraction as Record<string, unknown> | null) ?? {}
  const merged = { ...loserData, ...survivorData }
  await updateDocumentReview({ workspaceId, documentId: survivor.id, reviewedData: merged, actorId })
  await deleteWorkspaceDocuments(workspaceId, [loser.id], actorId)
  return { survivorId: survivor.id }
}

/** Canonical Document.status/pipeline-stage vocabulary. `Document.status` is a plain
 * `String @default("received")` (schema.prisma), not a Prisma enum — deliberately, since the
 * public REST API and Zapier persist and match on the raw string values. Keep it that way: this
 * module is a typed const union + mapping helpers over that string, never an enum requiring a
 * data migration. */

/** The persisted Document lifecycle. "received" is the schema default but is never actually
 * observed on a row — createDocumentFromBuffer writes "queued" in the same transaction that
 * creates the document — so it is handled only defensively, by normalizeStatus below. */
export const DOCUMENT_STATUSES = ["queued", "ready_for_review", "needs_review", "reviewed", "failed"] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

/** Terminal statuses: extraction has finished (successfully or not) and nothing async is still
 * writing to the document. Shared by the extraction-progress poller (client) and any server code
 * that needs to know a document is done moving. */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["ready_for_review", "needs_review", "reviewed", "failed"] satisfies DocumentStatus[])

/** Below this the extraction is a guess worth a second look. Relocated from lib/sheet-seed so
 * document code no longer has to import a sheet library to know the threshold; lib/sheet-seed
 * re-exports it for the sheet's own use. */
export const LOW_CONFIDENCE = 0.6

/** The UI pipeline tabs — the five-stage Documents lifecycle: Inbox (queued/failed) → Review
 * (waiting on a person) → Approved (reviewer signed off, nothing pushed yet) → Synced (at least
 * one integration accepted the bill) → Paid (a reviewer or the ledger confirmed payment). Derived
 * from Document.status + ReviewTask/IntegrationPush/paymentStatus, never persisted. The former
 * three-stage names ("to_review", "ready") remain valid as **aliases** in the public API — see
 * LEGACY_STAGE_ALIASES and parseStageAlias below. */
export const PIPELINE_STAGES = ["inbox", "review", "approved", "synced", "paid"] as const
export type PipelineStage = (typeof PIPELINE_STAGES)[number]

/** User-visible stage names. The one place the app spells the lifecycle out — the sidebar badge,
 * the tabs, the storyboard the audit talked about. */
export const STAGE_LABELS: Record<PipelineStage, string> = {
  inbox: "Inbox",
  review: "Review",
  approved: "Approved",
  synced: "Synced",
  paid: "Paid",
}

/** Kept indefinitely: the /api/v1/documents contract accepted `to_review` and `ready` since v1,
 * and Zapier/webhook consumers write against those names. New names go OUT (Documents-visible
 * copy is on the new vocabulary); the API still parses the old ones with these aliases. */
export const LEGACY_STAGE_ALIASES: Record<string, PipelineStage> = {
  to_review: "review",
  ready: "approved",
}

/** Accepts `PipelineStage`, a legacy alias, or anything else, and returns the canonical stage or
 * null. Not throwing (the API answers 400 explicitly on a bad `stage`; internal callers already
 * hold a `PipelineStage`). */
export function parseStageAlias(raw: string | null | undefined): PipelineStage | null {
  if (!raw) return null
  if ((PIPELINE_STAGES as readonly string[]).includes(raw)) return raw as PipelineStage
  return LEGACY_STAGE_ALIASES[raw] ?? null
}

/** Folds legacy/phantom status values onto the real ones: the schema's "received" default
 * (never actually written) and "extracted" (only ever written to IngestionItem, never to
 * Document — the drift bug lib/finance/inbox.ts used to have) both mean "still queued" for any
 * Document row that happens to carry them. */
export function normalizeStatus(raw: string): DocumentStatus {
  if ((DOCUMENT_STATUSES as readonly string[]).includes(raw)) return raw as DocumentStatus
  if (raw === "received" || raw === "extracted") return "queued"
  return "queued"
}

/** A minimal view of a Document (plus its review-task/push/payment state) sufficient to place it
 * on a pipeline tab. `archivedAt` is optional because the column does not exist yet (Phase 1 adds
 * it); until then no document is ever archived. */
export type StageableDocument = { status: string; archivedAt?: Date | null; paymentStatus?: string | null }

export type StageContext = {
  /** A queued/processing DocumentProcessingJob exists for this document. */
  hasActiveJob?: boolean
  /** An open or in_review ReviewTask exists for this document. */
  openReviewTask?: boolean
  /** At least one IntegrationPush for this document is in "succeeded". */
  hasSucceededPush?: boolean
}

/** Maps a document (+ its job/review-task/push context) onto the tab it belongs on. Precedence,
 * highest first: Paid > Synced > Review > Approved > Inbox — a paid bill with a stale open review
 * task lands on Paid (the money moved regardless), the confirmed-payment signal wins. */
export function documentStage(doc: StageableDocument, context: StageContext = {}): PipelineStage {
  const status = normalizeStatus(doc.status)
  if (doc.paymentStatus === "paid") return "paid"
  if (context.hasSucceededPush) return "synced"
  if (status === "needs_review" || status === "ready_for_review") return "review"
  if (status === "reviewed" && context.openReviewTask) return "review"
  if (status === "reviewed") return "approved"
  return "inbox"
}

/** The Prisma where-fragment for a stage's document-status set, so the pipeline list and its
 * count query share one definition of each tab. Kept here for callers that need the raw status
 * axis only (e.g. models/integrations.ts's cursor listing narrowing by status) — the full stage
 * predicate (relations + NOT exclusions) is `stageWhereClause` in models/documents.ts. */
import type { Prisma } from "@/prisma/client"

export function stageToStatusFilter(stage: PipelineStage): Prisma.DocumentWhereInput {
  switch (stage) {
    case "inbox":
      return { status: { in: ["queued", "failed"] } }
    case "review":
      return { status: { in: ["needs_review", "ready_for_review", "reviewed"] } }
    case "approved":
    case "synced":
    case "paid":
      return { status: "reviewed" }
  }
}

/** The status set that counts as "reviewed" for reporting purposes (finance inbox, folder
 * reports) — reviewed and ready_for_review, deliberately excluding the phantom "extracted" value
 * that was never actually written to Document.status. */
export const REVIEWED_OR_READY_STATUSES: readonly DocumentStatus[] = ["reviewed", "ready_for_review"]

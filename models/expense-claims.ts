// Deliberately NOT a "use server" module, matching every other models/*.ts helper: trusts the
// workspaceId it is handed. Server actions live in
// app/(app)/workspaces/[workspaceId]/expense-claim-actions.ts and do the auth + capability gate.
import { canDecideStage, decideStage, findCurrentStage, toWorkflowStageInputs } from "@/lib/approvals/engine"
import { auditEventData, getRequestAuditContext } from "@/lib/audit"
import { claimEligibility, type ClaimEligibility, type ClaimEligibilityReason } from "@/lib/claims/eligibility"
import { claimName } from "@/lib/claims/labels"
import type { DocumentClaimFacts, DocumentClaimView, DraftClaimOption, AddToClaimResult, ClaimReceipt } from "@/lib/claims/facts"
import type { ApprovalActor, ApprovalStageInfo } from "@/models/approvals"
import { getDefaultApprovalFlow } from "@/models/approval-defaults"
import { sumReceiptTotals } from "@/lib/claims/totals"
import { prisma } from "@/lib/db"
import { processingState } from "@/lib/documents/processing-state"
import { addCents, fromCents } from "@/lib/money"
import { cache } from "react"

export const EXPENSE_CLAIM_STATUSES = ["draft", "submitted", "approved", "rejected"] as const
export type ExpenseClaimStatus = (typeof EXPENSE_CLAIM_STATUSES)[number]
const RESOLVED_STATUSES = new Set<ExpenseClaimStatus>(["approved", "rejected"])

/** Same parse as models/receipts.ts: extraction stores totals as strings ("24.50"), so a claim's
 * sum must read them the way the Receipts list does or every submit refuses with "no amounts". */
function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[^0-9.\-]/g, ""))
    return Number.isFinite(n) ? n : null
  }
  return null
}
function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

/** Every document a claim item can be built from must already be an `expense_receipt`-templated
 * Document in this workspace, and not already claimed elsewhere — both enforced here rather than
 * left to the DB's unique constraint alone, so the caller gets a clear reason instead of a raw
 * constraint-violation error. Shared by createExpenseClaim and addExpenseClaimItems so "what counts
 * as claimable" only has one definition. */
type Db = Pick<typeof prisma, "document" | "documentCheckResult" | "reviewTask">
type ClassifiedDocument = { id: string; merchant: string; eligibility: ClaimEligibility; currencyCode: string | null }

export function eligibilityCode(reason: ClaimEligibilityReason): string {
  return reason === "supplier_receipt" ? "document_not_an_expense_receipt"
    : reason === "needs_attention" ? "document_needs_attention"
    : reason === "in_claim" ? "document_already_claimed"
    : "expense_claim_currency_mismatch"
}

/** Runs `claimEligibility` for every id and returns the per-document verdict — the add path
 * keeps the ineligible ones as "held back", the submit path refuses on the first. Takes the
 * client so `addToExpenseClaim` can re-read inside its transaction (spec §2 atomicity). */
async function classifyClaimableDocuments(db: Db, workspaceId: string, documentIds: string[], targetCurrencyCode?: string | null, excludeClaimId?: string): Promise<ClassifiedDocument[]> {
  const documents = await db.document.findMany({
    where: { id: { in: documentIds }, workspaceId },
    select: {
      id: true, status: true, reviewedData: true, rawExtraction: true,
      template: { select: { code: true } },
      expenseClaimItems: {
        where: excludeClaimId ? { claimId: { not: excludeClaimId } } : undefined,
        select: { claim: { select: { status: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  })
  if (documents.length !== documentIds.length) throw new Error("document_not_found")
  // Same derivation as models/receipts.ts's listReceipts (approval status from the newest
  // ReviewTask, open check_failed tasks, open escalations) so a receipt's row eligibility and the
  // server's re-check never disagree on "needs attention".
  const [escalations, reviewTasks] = await Promise.all([
    db.documentCheckResult.findMany({
      where: { workspaceId, documentId: { in: documentIds }, status: "escalated", OR: [{ escalationStatus: null }, { escalationStatus: { in: ["open", "in_review"] } }] },
      select: { documentId: true },
    }),
    db.reviewTask.findMany({
      where: { workspaceId, documentId: { in: documentIds } },
      select: { documentId: true, status: true, reason: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ])
  const escalatedIds = new Set(escalations.map((row) => row.documentId))
  const blockedIds = new Set(reviewTasks.filter((t) => t.reason === "check_failed" && (t.status === "open" || t.status === "in_review")).map((t) => t.documentId))
  const latestTaskByDoc = new Map<string, string>()
  for (const t of reviewTasks) if (!latestTaskByDoc.has(t.documentId)) latestTaskByDoc.set(t.documentId, t.status)
  return documents.map((document) => {
    const values = (document.reviewedData ?? document.rawExtraction ?? {}) as Record<string, unknown>
    const latestClaimStatus = (document.expenseClaimItems[0]?.claim.status ?? null) as "draft" | "submitted" | "approved" | "rejected" | null
    const latest = latestTaskByDoc.get(document.id)
    const approvalStatus = latest === "rejected" ? "rejected" : latest === "in_review" ? "in_progress" : latest === "open" ? "not_started" : "approved"
    const state = processingState({
      approvalStatus,
      blockedByCheck: blockedIds.has(document.id),
      escalated: escalatedIds.has(document.id),
      touchless: false,
      status: document.status,
    })
    const eligibility = claimEligibility({
      templateCode: document.template?.code ?? null,
      processingState: state,
      latestClaimStatus,
      currencyCode: typeof values.currency_code === "string" ? values.currency_code : null,
      targetCurrencyCode,
    })
    return { id: document.id, merchant: merchantOf(values), eligibility, currencyCode: asString(values.currency_code) }
  })
}

function merchantOf(values: Record<string, unknown>): string {
  return asString(values.merchant) ?? asString(values.vendor) ?? "This receipt"
}

/** Throws the server code for the first ineligible document, carrying `merchant` so the action can
 * name the receipt in its refusal sentence (lib/claims/refusals.ts). */
async function validateClaimableDocuments(workspaceId: string, documentIds: string[], targetCurrencyCode?: string | null, excludeClaimId?: string) {
  const classified = await classifyClaimableDocuments(prisma, workspaceId, documentIds, targetCurrencyCode, excludeClaimId)
  for (const document of classified) {
    if (document.eligibility.status === "not_eligible") throw Object.assign(new Error(eligibilityCode(document.eligibility.reason)), { merchant: document.merchant })
  }
}

/** Creates the claim and its items in one transaction, "draft" status. */
export async function createExpenseClaim(input: { workspaceId: string; submitterId: string; title?: string | null; documentIds: string[] }) {
  const documentIds = [...new Set(input.documentIds)].slice(0, 200)
  if (!documentIds.length) throw new Error("expense_claim_needs_at_least_one_receipt")
  await validateClaimableDocuments(input.workspaceId, documentIds)

  return prisma.expenseClaim.create({
    data: {
      workspaceId: input.workspaceId, submitterId: input.submitterId, title: input.title?.trim() || null,
      items: { create: documentIds.map((documentId) => ({ workspaceId: input.workspaceId, documentId })) },
    },
    include: { items: { include: { document: { select: { id: true, filename: true, reviewedData: true } } } } },
  })
}

/** `expense_receipt` documents in this workspace with no `ExpenseClaimItem` pointing at them yet —
 * what the "new claim" form offers to pick from. `none: { items: ... }` rather than a left-join
 * exclusion list keeps this a single query instead of fetching all claimed ids first. */
export const listUnclaimedExpenseReceiptDocuments = cache(async (workspaceId: string) => prisma.document.findMany({
  where: { workspaceId, template: { code: "expense_receipt" }, expenseClaimItems: { none: {} } },
  select: { id: true, filename: true, reviewedData: true, rawExtraction: true, receivedAt: true },
  orderBy: { receivedAt: "desc" },
  take: 200,
}))

export type ExpenseClaimFilters = { status?: ExpenseClaimStatus; submitterId?: string }

export const listExpenseClaims = cache(async (workspaceId: string, filters: ExpenseClaimFilters = {}) => prisma.expenseClaim.findMany({
  where: { workspaceId, ...(filters.status ? { status: filters.status } : {}), ...(filters.submitterId ? { submitterId: filters.submitterId } : {}) },
  include: {
    submitter: { select: { id: true, name: true, email: true } },
    items: { include: { document: { select: { id: true, filename: true, reviewedData: true } } } },
    workflow: { include: { stages: { orderBy: { stageIndex: "asc" } } } },
  },
  orderBy: [{ createdAt: "desc" }],
  take: 500,
}))

export const getExpenseClaim = cache(async (workspaceId: string, claimId: string) => prisma.expenseClaim.findFirst({
  where: { id: claimId, workspaceId },
  include: {
    submitter: { select: { id: true, name: true, email: true } },
    items: { include: { document: { select: { id: true, filename: true, reviewedData: true } } } },
    workflow: { include: { stages: { orderBy: { stageIndex: "asc" } } } },
  },
}))

/** Only a draft can be deleted — once submitted, a claim is a decision record even if it's later
 * rejected, the same reasoning ReviewTask never gets hard-deleted after leaving "open". */
export async function deleteExpenseClaim(workspaceId: string, claimId: string) {
  const claim = await prisma.expenseClaim.findFirst({ where: { id: claimId, workspaceId }, select: { id: true, status: true } })
  if (!claim) throw new Error("expense_claim_not_found")
  if (claim.status !== "draft") throw new Error("expense_claim_not_draft")
  await prisma.expenseClaim.delete({ where: { id: claim.id } })
}

/** Adds more unclaimed `expense_receipt` documents to an existing draft — the missing half of
 * WP3.3's "no editing a draft claim's receipts" gap (`createExpenseClaim` only ever took its full
 * document list up front). Draft-only, same as deleteExpenseClaim: once submitted, a claim's
 * receipt list is part of the decision record. */
export async function addExpenseClaimItems(workspaceId: string, claimId: string, documentIds: string[]) {
  const ids = [...new Set(documentIds)].slice(0, 200)
  if (!ids.length) throw new Error("no_receipts_given")
  const claim = await prisma.expenseClaim.findFirst({ where: { id: claimId, workspaceId }, select: { id: true, status: true } })
  if (!claim) throw new Error("expense_claim_not_found")
  if (claim.status !== "draft") throw new Error("expense_claim_not_draft")
  await validateClaimableDocuments(workspaceId, ids)
  await prisma.expenseClaimItem.createMany({ data: ids.map((documentId) => ({ workspaceId, claimId, documentId })) })
}

/** Removes one receipt from a still-draft claim. Refuses to leave the claim with zero items —
 * `submitExpenseClaim` already refuses an empty claim, so an empty draft is a dead end; delete the
 * whole claim instead (deleteExpenseClaim), which also frees its (zero) receipts, trivially. */
export async function removeExpenseClaimItem(workspaceId: string, claimId: string, itemId: string) {
  const claim = await prisma.expenseClaim.findFirst({
    where: { id: claimId, workspaceId },
    select: { id: true, status: true, items: { select: { id: true } } },
  })
  if (!claim) throw new Error("expense_claim_not_found")
  if (claim.status !== "draft") throw new Error("expense_claim_not_draft")
  const item = claim.items.find((candidate) => candidate.id === itemId)
  if (!item) throw new Error("expense_claim_item_not_found")
  if (claim.items.length === 1) throw new Error("expense_claim_needs_at_least_one_receipt")
  await prisma.expenseClaimItem.delete({ where: { id: itemId } })
}

/** Locks the claim in: computes and freezes `total`/`currencyCode` from its items' own extracted
 * data, moves to "submitted", and — if a workflowId is given — starts it at stage 0 exactly the
 * way createReviewTask's own workflowId option does. Refuses an empty claim (all items removed
 * since creation) and refuses re-submitting anything but a draft. */
export async function submitExpenseClaim(input: { workspaceId: string; claimId: string; actorId: string; workflowId?: string | null }) {
  const claim = await prisma.expenseClaim.findFirst({
    where: { id: input.claimId, workspaceId: input.workspaceId },
    include: { items: { include: { document: { select: { reviewedData: true, rawExtraction: true } } } } },
  })
  if (!claim) throw new Error("expense_claim_not_found")
  if (claim.status !== "draft") throw new Error("expense_claim_not_draft")
  if (!claim.items.length) throw new Error("expense_claim_needs_at_least_one_receipt")

  if (input.workflowId) {
    const workflow = await prisma.approvalWorkflow.findFirst({ where: { id: input.workflowId, workspaceId: input.workspaceId }, select: { id: true } })
    if (!workflow) throw new Error("approval_workflow_not_found")
  }

  // Re-check every item against the same eligibility a receipt was added under (§2): another
  // member may have claimed one of these documents elsewhere since it was added to this draft.
  await validateClaimableDocuments(input.workspaceId, claim.items.map((item) => item.documentId), undefined, claim.id)

  const totals = sumReceiptTotals(
    claim.items.map((item) => {
      const values = (item.document.reviewedData ?? item.document.rawExtraction ?? {}) as Record<string, unknown>
      return { amount: asNumber(values.total), currencyCode: asString(values.currency_code) }
    }),
  )
  if (totals.mixed) throw new Error("expense_claim_mixed_currency")
  if (totals.missing === claim.items.length) throw new Error("expense_claim_no_amounts")
  const total = totals.total
  const currencyCode = totals.currencyCode

  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.expenseClaim.update({
      where: { id: claim.id },
      data: {
        status: "submitted", total, currencyCode, submittedAt: new Date(),
        ...(input.workflowId ? { workflowId: input.workflowId, currentStageIndex: 0 } : {}),
      },
    }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, actorId: input.actorId, type: "expense_claim_submitted", detail: { claimId: claim.id, total, itemCount: claim.items.length } }, context) }),
  ])
  return updated
}

/** The plain (no-workflow) approve/reject path — mirrors updateReviewTaskStatus. Refuses a claim
 * that has a workflow attached; use decideExpenseClaimStage for that instead, same split as
 * ReviewTask's updateReviewTaskStatus vs decideReviewTaskStage. */
export async function updateExpenseClaimStatus(input: { workspaceId: string; claimId: string; status: "approved" | "rejected"; actorId: string; reason?: string | null }) {
  const claim = await prisma.expenseClaim.findFirst({ where: { id: input.claimId, workspaceId: input.workspaceId }, select: { id: true, status: true, workflowId: true } })
  if (!claim) throw new Error("expense_claim_not_found")
  if (claim.status !== "submitted") throw new Error("expense_claim_not_submitted")
  if (claim.workflowId) throw new Error("expense_claim_has_workflow")
  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.expenseClaim.update({ where: { id: claim.id }, data: { status: input.status, resolvedAt: new Date() } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, actorId: input.actorId, type: "expense_claim_status_changed", detail: { claimId: claim.id, from: claim.status, to: input.status, ...(input.reason ? { reason: input.reason } : {}) } }, context) }),
  ])
  return updated
}

/** The workflow-aware counterpart — same shape as models/review-tasks.ts's decideReviewTaskStage,
 * just operating on ExpenseClaim's own workflowId/currentStageIndex instead of ReviewTask's. */
export async function decideExpenseClaimStage(input: { workspaceId: string; claimId: string; decision: "approve" | "reject"; actorId: string; actorRole: "owner" | "member"; reason?: string | null }) {
  const claim = await prisma.expenseClaim.findFirst({
    where: { id: input.claimId, workspaceId: input.workspaceId },
    include: { workflow: { include: { stages: { orderBy: { stageIndex: "asc" } } } } },
  })
  if (!claim) throw new Error("expense_claim_not_found")
  if (!claim.workflow || claim.currentStageIndex === null) throw new Error("expense_claim_has_no_workflow")

  const stages = toWorkflowStageInputs(claim.workflow.stages)
  const currentStage = findCurrentStage(stages, claim.currentStageIndex)
  if (!currentStage) throw new Error("workflow_stage_not_found")
  if (!canDecideStage({ stage: currentStage, actorRole: input.actorRole, actorId: input.actorId })) throw new Error("stage_requires_owner")

  const result = decideStage({ stages, currentStageIndex: claim.currentStageIndex, decision: input.decision })
  const nextStatus = result.outcome === "advance" ? "submitted" : result.outcome
  const nextStageIndex = result.outcome === "advance" ? result.nextStageIndex : claim.currentStageIndex
  const resolvedAt = result.outcome === "advance" ? null : new Date()

  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.expenseClaim.update({ where: { id: claim.id }, data: { status: nextStatus, currentStageIndex: nextStageIndex, resolvedAt } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, actorId: input.actorId, type: "expense_claim_stage_decided", detail: { claimId: claim.id, stageIndex: currentStage.stageIndex, stageName: currentStage.name, decision: input.decision, outcome: result.outcome, ...(input.reason ? { reason: input.reason } : {}) } }, context) }),
  ])
  return updated
}

/** Takes a submitted claim back to draft — refused once any stage has decided it (spec §5.3):
 * once a stage has weighed in, going back to draft would erase that decision silently, so the
 * claimant deletes and recreates instead in that case. Resets the frozen total/currency/stage
 * fields so the next submit re-takes the freeze rather than reusing a stale one. */
export async function withdrawExpenseClaim(input: { workspaceId: string; claimId: string; actorId: string }) {
  const claim = await prisma.expenseClaim.findFirst({ where: { id: input.claimId, workspaceId: input.workspaceId }, select: { id: true, status: true, currentStageIndex: true } })
  if (!claim) throw new Error("expense_claim_not_found")
  if (claim.status !== "submitted") throw new Error("expense_claim_not_submitted")
  if (claim.currentStageIndex !== null && claim.currentStageIndex > 0) throw new Error("expense_claim_stage_decided")

  const decidedEvent = await prisma.documentAuditEvent.findFirst({ where: { workspaceId: input.workspaceId, type: "expense_claim_stage_decided", detail: { path: ["claimId"], equals: claim.id } }, select: { id: true } })
  if (decidedEvent) throw new Error("expense_claim_stage_decided")

  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.expenseClaim.update({
      where: { id: claim.id },
      data: { status: "draft", total: null, currencyCode: null, submittedAt: null, currentStageIndex: null, workflowId: null },
    }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, actorId: input.actorId, type: "expense_claim_withdrawn", detail: { claimId: claim.id } }, context) }),
  ])
  return updated
}

export type ExpenseClaimRow = {
  claimId: string
  name: string
  claimant: { id: string; name: string | null } | null
  receiptCount: number
  total: number | null
  currencyCode: string | null
  stage: ApprovalStageInfo
  submittedAt: Date | null
  canDecide: boolean
  nextStageName: string | null
  hasWorkflow: boolean
  firstDocumentId: string | null
}

const OWNER_STAGE: ApprovalStageInfo = { index: 0, total: 1, name: "Owner" }

type ClaimWithWorkflow = {
  workflowId: string | null
  currentStageIndex: number | null
  workflow: { stages: Parameters<typeof toWorkflowStageInputs>[0] } | null
}

/** Stage facts for a submitted claim: with a flow, the engine's current stage; without one, the
 * single implicit "Owner" stage any owner decides. One derivation for the list, the pane and the
 * badge. */
function claimStageFacts(claim: ClaimWithWorkflow, actor: ApprovalActor) {
  const actorRole = actor.role === "owner" ? "owner" : "member"
  if (!claim.workflow || claim.currentStageIndex === null) {
    return { stage: OWNER_STAGE, canDecide: actorRole === "owner", nextStageName: null, stages: [] as ReturnType<typeof toWorkflowStageInputs>, current: null, hasWorkflow: false }
  }
  const stages = toWorkflowStageInputs(claim.workflow.stages)
  const current = findCurrentStage(stages, claim.currentStageIndex)
  const next = stages.find((stage) => stage.stageIndex > claim.currentStageIndex!)
  return {
    stage: { index: claim.currentStageIndex, total: stages.length, name: current?.name ?? "Unknown stage" },
    canDecide: current ? canDecideStage({ stage: current, actorRole, actorId: actor.userId }) : false,
    nextStageName: next?.name ?? null,
    stages, current, hasWorkflow: true,
  }
}

const CLAIM_INCLUDE = {
  submitter: { select: { id: true, name: true, email: true } },
  items: { include: { document: { select: { id: true, reviewedData: true, rawExtraction: true } } }, orderBy: { createdAt: "asc" as const } },
  workflow: { include: { stages: { orderBy: { stageIndex: "asc" as const } } } },
}

/** Submitted claims for the Approvals › Expense claims list (S4) — the shape `filterExpenseClaimRows`
 * / `QueueScreen<ExpenseClaimRow>` reads. */
export const listExpenseClaimRows = cache(async (workspaceId: string, actor: ApprovalActor): Promise<ExpenseClaimRow[]> => {
  const claims = await prisma.expenseClaim.findMany({
    where: { workspaceId, status: "submitted" },
    include: CLAIM_INCLUDE,
    orderBy: { submittedAt: "asc" },
    take: 500,
  })
  return claims.map((claim) => {
    const facts = claimStageFacts(claim, actor)
    return {
      claimId: claim.id,
      name: claimName(claim),
      claimant: claim.submitter ? { id: claim.submitter.id, name: claim.submitter.name || claim.submitter.email } : null,
      receiptCount: claim.items.length,
      total: claim.total != null ? Number(claim.total) : null,
      currencyCode: claim.currencyCode,
      stage: facts.stage,
      submittedAt: claim.submittedAt,
      canDecide: facts.canDecide,
      nextStageName: facts.nextStageName,
      hasWorkflow: facts.hasWorkflow,
      firstDocumentId: claim.items[0]?.documentId ?? null,
    }
  })
})

/** Submitted claims the actor can decide — added to the Ready to Approve badge (spec §2). */
export async function countClaimsReadyToApprove(workspaceId: string, actor: ApprovalActor): Promise<number> {
  const rows = await listExpenseClaimRows(workspaceId, actor)
  return rows.filter((row) => row.canDecide).length
}

/** The actor's own drafts, for the S2 dialog's target radios. */
export async function listMyDraftClaims(workspaceId: string, actorId: string): Promise<DraftClaimOption[]> {
  const claims = await prisma.expenseClaim.findMany({
    where: { workspaceId, status: "draft", submitterId: actorId },
    include: { items: { include: { document: { select: { reviewedData: true, rawExtraction: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  return claims.map((claim) => {
    const totals = sumReceiptTotals(claim.items.map((item) => receiptAmount(item.document)))
    return { id: claim.id, name: claimName(claim), receiptCount: claim.items.length, total: totals.total, currencyCode: totals.currencyCode, mixed: totals.mixed }
  })
}

function receiptAmount(document: { reviewedData: unknown; rawExtraction: unknown }) {
  const values = (document.reviewedData ?? document.rawExtraction ?? {}) as Record<string, unknown>
  return { amount: asNumber(values.total), currencyCode: asString(values.currency_code) }
}

/** S2's write: one transaction that re-classifies every document (latest claim re-read inside the
 * transaction) before inserting items, so two members adding the same receipt concurrently can't
 * both win. Ineligible documents are held back with their reason, never silently dropped. */
export async function addToExpenseClaim(input: { workspaceId: string; actorId: string; documentIds: string[]; target: { new: { title?: string | null } } | { claimId: string } }): Promise<AddToClaimResult> {
  const documentIds = [...new Set(input.documentIds)].slice(0, 200)
  if (!documentIds.length) throw new Error("expense_claim_needs_at_least_one_receipt")
  return prisma.$transaction(async (tx) => {
    let claimId: string
    let targetCurrency: string | null = null
    let title: string | null = null
    let createdAt: Date
    if ("claimId" in input.target) {
      const claim = await tx.expenseClaim.findFirst({
        where: { id: input.target.claimId, workspaceId: input.workspaceId },
        include: { items: { include: { document: { select: { reviewedData: true, rawExtraction: true } } }, take: 1, orderBy: { createdAt: "asc" } } },
      })
      if (!claim) throw new Error("expense_claim_not_found")
      if (claim.status !== "draft") throw new Error("expense_claim_not_draft")
      claimId = claim.id; title = claim.title; createdAt = claim.createdAt
      targetCurrency = claim.items[0] ? receiptAmount(claim.items[0].document).currencyCode : null
    } else {
      const created = await tx.expenseClaim.create({ data: { workspaceId: input.workspaceId, submitterId: input.actorId, title: input.target.new.title?.trim() || null, status: "draft" } })
      claimId = created.id; title = created.title; createdAt = created.createdAt
    }
    const classified = await classifyClaimableDocuments(tx, input.workspaceId, documentIds, targetCurrency)
    const eligible = classified.filter((d) => d.eligibility.status === "ready")
    // A new claim's currency is its first receipt's: later receipts in another currency are held back.
    const firstCurrency = targetCurrency ?? eligible[0]?.currencyCode ?? null
    const added: string[] = []
    const heldBack: AddToClaimResult["heldBack"] = []
    for (const document of classified) {
      if (document.eligibility.status === "not_eligible") { heldBack.push({ id: document.id, merchant: document.merchant, reason: document.eligibility.reason }); continue }
      if (firstCurrency && document.currencyCode && document.currencyCode !== firstCurrency) { heldBack.push({ id: document.id, merchant: document.merchant, reason: "currency_mismatch" }); continue }
      added.push(document.id)
    }
    if (!added.length) {
      if (!("claimId" in input.target)) throw Object.assign(new Error(eligibilityCode((classified[0].eligibility as { reason: ClaimEligibilityReason }).reason)), { merchant: classified[0].merchant })
    } else {
      await tx.expenseClaimItem.createMany({ data: added.map((documentId) => ({ claimId, documentId, workspaceId: input.workspaceId })) })
    }
    const context = await getRequestAuditContext()
    await tx.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, actorId: input.actorId, type: "expense_claim_items_added", detail: { claimId, documentIds: added, heldBack: heldBack.length } }, context) })
    return { claimId, name: claimName({ title, createdAt }), added, heldBack }
  })
}

type LoadedClaim = NonNullable<Awaited<ReturnType<typeof loadClaim>>>
async function loadClaim(workspaceId: string, claimId: string) {
  return prisma.expenseClaim.findFirst({ where: { id: claimId, workspaceId }, include: CLAIM_INCLUDE })
}

/** Everything the Approval-tab claim card (S3) and the S4 pane show — one function, so the row
 * and the pane never disagree (lesson #250 H8). Amounts: frozen once submitted, else summed live. */
async function buildClaimFacts(claim: LoadedClaim, actor: ApprovalActor): Promise<DocumentClaimFacts> {
  const isOwner = actor.role === "owner"
  const isMine = claim.submitterId === actor.userId
  const stageFacts = claimStageFacts(claim, actor)
  const [events, defaultFlow] = await Promise.all([
    prisma.documentAuditEvent.findMany({ where: { workspaceId: claim.workspaceId, type: { startsWith: "expense_claim" }, detail: { path: ["claimId"], equals: claim.id } }, orderBy: { createdAt: "asc" } }),
    claim.status === "draft" ? getDefaultApprovalFlow(claim.workspaceId) : null,
  ])
  const actorIds = [...new Set([...events.map((e) => e.actorId), ...stageFacts.current?.approverIds ?? []].filter((id): id is string => !!id))]
  const users = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : []
  const nameOf = (id: string | null) => { const u = users.find((x) => x.id === id); return u ? u.name || u.email : "Someone" }

  const receipts: ClaimReceipt[] = claim.items.map((item) => {
    const values = (item.document.reviewedData ?? item.document.rawExtraction ?? {}) as Record<string, unknown>
    return { documentId: item.documentId, itemId: item.id, merchant: merchantOf(values), amount: asNumber(values.total), currencyCode: asString(values.currency_code), date: asString(values.date) ?? asString(values.issued_at) }
  })
  const live = sumReceiptTotals(receipts)
  const frozen = claim.status !== "draft" && claim.total != null
  const total = frozen ? Number(claim.total) : live.total
  const currencyCode = frozen ? claim.currencyCode : live.currencyCode

  const decisions = events.filter((e) => e.type === "expense_claim_stage_decided").map((e) => {
    const d = (e.detail ?? {}) as Record<string, unknown>
    return { id: e.id, stageIndex: asNumber(d.stageIndex) ?? 0, stageName: asString(d.stageName) ?? "Stage", decision: (d.decision === "reject" ? "reject" : "approve") as "approve" | "reject", note: asString(d.reason), actorName: nameOf(e.actorId), decidedAt: e.createdAt.toISOString() }
  })
  const statusEvent = [...events].reverse().find((e) => e.type === "expense_claim_status_changed")
  const finalEvent = statusEvent ?? events.filter((e) => e.type === "expense_claim_stage_decided").pop() ?? null
  const finalReason = finalEvent ? asString(((finalEvent.detail ?? {}) as Record<string, unknown>).reason) : null
  const submittedEvent = [...events].reverse().find((e) => e.type === "expense_claim_submitted")
  const auditItemCount = submittedEvent ? asNumber(((submittedEvent.detail ?? {}) as Record<string, unknown>).itemCount) : null
  const stageDecided = decisions.length > 0 || (claim.currentStageIndex ?? 0) > 0

  const submitDisabledReason = live.mixed ? "Receipts are in two currencies. Remove one currency's receipts first."
    : live.missing === receipts.length ? "Add an amount to at least one receipt first." : null
  const submitGoesTo = defaultFlow?.active ? `${defaultFlow.name} approvers` : "Any owner"
  const canEditDraft = claim.status === "draft" && (isMine || isOwner)
  const named = (stageFacts.current?.approverIds ?? []).map((id) => nameOf(id))
  const waitingOn = claim.status !== "submitted" ? null
    : !stageFacts.hasWorkflow ? "any owner"
    : named.length ? named.join(", ") : stageFacts.current?.requireOwner ? "an owner" : "any member"
  const pendingStages = stageFacts.stages.filter((s) => claim.currentStageIndex !== null && s.stageIndex >= claim.currentStageIndex).map((s) => ({ stageIndex: s.stageIndex, stageName: s.name }))

  return {
    id: claim.id,
    name: claimName(claim),
    status: claim.status as DocumentClaimFacts["status"],
    claimant: { id: claim.submitterId ?? "", name: claim.submitter ? claim.submitter.name || claim.submitter.email : "Unknown member" },
    isMine, isOwner,
    receiptCount: receipts.length,
    total, currencyCode,
    missingAmounts: live.missing,
    mixed: !frozen && live.mixed,
    byCurrency: live.byCurrency,
    frozen,
    canSubmit: canEditDraft && !submitDisabledReason && receipts.length > 0,
    submitDisabledReason: canEditDraft ? submitDisabledReason : null,
    submitGoesTo,
    canWithdraw: claim.status === "submitted" && (isMine || isOwner) && !stageDecided,
    canDelete: canEditDraft,
    canRemove: canEditDraft,
    canDecide: claim.status === "submitted" && stageFacts.canDecide,
    hasWorkflow: stageFacts.hasWorkflow,
    submittedAt: claim.submittedAt?.toISOString() ?? null,
    waitingOn,
    waitingOnYou: claim.status === "submitted" && stageFacts.canDecide,
    stageLabel: claim.status === "submitted" ? `${stageFacts.stage.index + 1} of ${stageFacts.stage.total} · ${stageFacts.stage.name}` : null,
    approval: claim.status === "approved" && finalEvent ? { by: nameOf(finalEvent.actorId), at: finalEvent.createdAt.toISOString() } : null,
    rejection: claim.status === "rejected" && finalEvent ? { reason: finalReason, by: nameOf(finalEvent.actorId), at: finalEvent.createdAt.toISOString() } : null,
    deletedReceiptCount: auditItemCount !== null ? Math.max(0, auditItemCount - receipts.length) : 0,
    receipts,
    decisions,
    pendingStages,
    timelineApproval: claim.status === "submitted" && stageFacts.hasWorkflow && claim.currentStageIndex !== null ? {
      startedBy: claim.submitter ? { name: claim.submitter.name || claim.submitter.email, avatar: null } : null,
      startedAt: (claim.submittedAt ?? claim.createdAt).toISOString(),
      stages: stageFacts.stages.map((s) => ({ stageIndex: s.stageIndex, name: s.name })),
      currentStageIndex: claim.currentStageIndex,
      waitingOnYou: stageFacts.canDecide,
      waitingOn: waitingOn ?? "",
    } : null,
  }
}

/** The receipt's latest claim (by claim `createdAt`) plus its eligibility when unclaimed — what
 * `getSelectionAuditPanelDataAction` hands the Approval tab (S3). */
export async function getDocumentClaimFacts(workspaceId: string, documentId: string, actor: ApprovalActor): Promise<DocumentClaimView> {
  const item = await prisma.expenseClaimItem.findFirst({ where: { documentId, claim: { workspaceId } }, orderBy: { claim: { createdAt: "desc" } }, select: { claimId: true } })
  const [claim, classified] = await Promise.all([
    item ? loadClaim(workspaceId, item.claimId) : null,
    classifyClaimableDocuments(prisma, workspaceId, [documentId]).catch(() => [] as ClassifiedDocument[]),
  ])
  const eligibility: ClaimEligibility = classified[0]?.eligibility ?? { status: "not_eligible", reason: "supplier_receipt" }
  return { claim: claim ? await buildClaimFacts(claim, actor) : null, claimEligibility: eligibility }
}

/** S4 pane: the claim by id, or null when it isn't this workspace's. */
export async function getExpenseClaimDetail(workspaceId: string, claimId: string, actor: ApprovalActor): Promise<DocumentClaimFacts | null> {
  const claim = await loadClaim(workspaceId, claimId)
  return claim ? buildClaimFacts(claim, actor) : null
}

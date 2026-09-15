// Deliberately NOT a "use server" module, matching models/documents.ts and models/workspaces.ts:
// these helpers trust the workspaceId they are handed. Server actions live in
// app/(app)/workspaces/[workspaceId]/review-actions.ts and do the auth.
import { track } from "@/lib/analytics"
import { canDecideStage, decideStage, findCurrentStage, toWorkflowStageInputs } from "@/lib/approvals/engine"
import { isPaymentConfirmationRequired } from "@/lib/doc-types"
import { auditEventData, getRequestAuditContext } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { cache } from "react"

export const REVIEW_TASK_STATUSES = ["open", "in_review", "approved", "rejected"] as const
export type ReviewTaskStatus = (typeof REVIEW_TASK_STATUSES)[number]
const RESOLVED_STATUSES = new Set<ReviewTaskStatus>(["approved", "rejected"])

/** Throws when a document needs a paid/unpaid confirmation before it can be approved and does not
 * have one yet — see Document.paymentStatus in prisma/schema.prisma and
 * lib/doc-types.ts's isPaymentConfirmationRequired. Checked at the moment a task is ABOUT to
 * become "approved", not earlier, so a document that later turns out not to need confirmation
 * (its docType was reclassified, say) is never blocked on a stale requirement.
 *
 * WP-AP2: skipped when a ledger sync will fill in paymentStatus authoritatively. Any pending or
 * succeeded IntegrationPush on this document means the accounting provider (QuickBooks / Xero /
 * Bigcapital) is the source of truth for paid state going forward, and asking a reviewer to
 * commit to "paid" or "unpaid" at approve-time — before payment has even happened — is friction
 * with no signal. This matches how every other AP-first platform behaves: Bill.com's "Mark as
 * Paid" is documented as the escape hatch for payments made OUTSIDE Bill; Tipalti's "mark paid
 * manually" is the same, out-of-band-only; Stampli reads payment status back FROM QuickBooks
 * every 5 minutes; Vic.ai's Autopilot approves without any human step at all. The gate is kept
 * for workspaces with no ledger connection at all, where the manual click is still the only
 * paid-state signal that will ever land. */
async function assertPaymentConfirmed(
  workspaceId: string,
  documentId: string,
  document: { docType: string | null; paymentStatus: string | null; template: { code: string } | null },
): Promise<void> {
  if (document.paymentStatus) return
  if (!isPaymentConfirmationRequired(document)) return
  const ledgerWillFillItIn = await prisma.integrationPush.findFirst({
    where: { workspaceId, documentId, status: { in: ["pending", "succeeded"] } },
    select: { id: true },
  })
  if (ledgerWillFillItIn) return
  throw new Error("payment_status_required")
}

const DOCUMENT_PAYMENT_GATE_SELECT = { docType: true, paymentStatus: true, template: { select: { code: true } } } as const

/** Bulk equivalent of assertPaymentConfirmed: one IntegrationPush.findMany per bulk approve
 * instead of N. Called with the full task list; returns the [approvable, blocked] split without
 * throwing so one document missing its confirmation withholds only itself, not the batch. */
async function partitionByPaymentGate<T extends { documentId: string; document: { docType: string | null; paymentStatus: string | null; template: { code: string } | null } }>(workspaceId: string, tasks: T[]): Promise<[T[], T[]]> {
  const candidates = tasks.filter((task) => !task.document.paymentStatus && isPaymentConfirmationRequired(task.document))
  if (!candidates.length) return [tasks, []]
  const pushed = await prisma.integrationPush.findMany({
    where: { workspaceId, documentId: { in: candidates.map((task) => task.documentId) }, status: { in: ["pending", "succeeded"] } },
    select: { documentId: true },
  })
  const pushedDocIds = new Set(pushed.map((row) => row.documentId))
  const approvable: T[] = []
  const blocked: T[] = []
  for (const task of tasks) {
    const needsGate = !task.document.paymentStatus && isPaymentConfirmationRequired(task.document)
    if (!needsGate || pushedDocIds.has(task.documentId)) approvable.push(task)
    else blocked.push(task)
  }
  return [approvable, blocked]
}

export const REVIEW_TASK_REASONS = ["manual", "low_confidence", "rule_required", "check_failed", "ai_suggestion", "push_preflight"] as const
export type ReviewTaskReason = (typeof REVIEW_TASK_REASONS)[number]

export function parseReviewTaskStatus(value: unknown): ReviewTaskStatus | null {
  return REVIEW_TASK_STATUSES.includes(value as ReviewTaskStatus) ? (value as ReviewTaskStatus) : null
}

/** Manual creation is the only path a person can trigger today — WP11 (automation rules) and
 * WP12 (deterministic checks) are what will call this with "low_confidence"/"rule_required"/
 * "check_failed" once they land.
 *
 * `workflowId` (Dext-parity Phase 3 WP3.1) is optional: passing one starts the task at stage 0
 * (status "in_review") instead of the plain "open" default. It is the caller's job to have already
 * confirmed the workflow belongs to this workspace — this function does not re-validate it, since
 * every current caller already has the workflow row in hand (e.g. from a workspace's configured
 * default). Attaching a workflow to a task that already exists uses
 * models/approval-workflows.ts's startWorkflowOnReviewTask instead. */
export async function createReviewTask(input: {
  workspaceId: string; documentId: string; reason?: ReviewTaskReason; detail?: string | null
  priority?: number; dueAt?: Date | null; assigneeId?: string | null; createdById: string | null
  workflowId?: string | null
}) {
  const document = await prisma.document.findFirst({ where: { id: input.documentId, workspaceId: input.workspaceId }, select: { id: true } })
  if (!document) throw new Error("document_not_found")
  const context = await getRequestAuditContext()
  const [task] = await prisma.$transaction([
    prisma.reviewTask.create({
      data: {
        workspaceId: input.workspaceId, documentId: input.documentId, reason: input.reason ?? "manual",
        detail: input.detail ?? null, priority: input.priority ?? 0, dueAt: input.dueAt ?? null,
        assigneeId: input.assigneeId ?? null, createdById: input.createdById,
        ...(input.workflowId ? { workflowId: input.workflowId, currentStageIndex: 0, status: "in_review" } : {}),
      },
    }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, documentId: input.documentId, actorId: input.createdById, type: "review_task_created" }, context) }),
  ])
  return task
}

export type ReviewTaskFilters = { status?: ReviewTaskStatus; assigneeId?: string | null; reason?: ReviewTaskReason }

export const listReviewTasks = cache(async (workspaceId: string, filters: ReviewTaskFilters = {}) => prisma.reviewTask.findMany({
  where: {
    workspaceId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.reason ? { reason: filters.reason } : {}),
    ...(filters.assigneeId !== undefined ? { assigneeId: filters.assigneeId } : {}),
  },
  include: {
    document: {
      select: {
        id: true, filename: true, status: true, receivedAt: true, confidence: true,
        reviewedData: true, codingData: true,
        template: { select: { name: true, code: true } },
        appliedRule: { select: { name: true } },
        checkResults: { select: { checkCode: true, status: true, message: true }, where: { status: { not: "pass" } } },
      },
    },
    assignee: { select: { id: true, name: true, email: true } },
  },
  orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  take: 500,
}))

/** The document page's "send for review" affordance needs to know whether this document already
 * has an unresolved task before offering to create another — a document already `in_review` under
 * a workflow, or sitting `open`, should link to that task rather than let someone spawn a second,
 * competing one. Most recent first: a document can theoretically have more than one unresolved task
 * only if something outside this affordance created it, but the newest is still the right one to
 * point at. */
/** Home's "Awaiting review" card needs only a count, not the 500-row listReviewTasks payload. */
export const countOpenReviewTasks = cache(async (workspaceId: string) =>
  prisma.reviewTask.count({ where: { workspaceId, status: { in: ["open", "in_review"] } } }))

/** The file hub's own open-review-tasks list — listReviewTasks scoped down to one file's
 * documents, for a card that only makes sense once review-queue is enabled. */
export const listOpenReviewTasksForFile = cache(async (workspaceId: string, fileId: string) => prisma.reviewTask.findMany({
  where: { workspaceId, status: { in: ["open", "in_review"] }, document: { fileId } },
  include: { document: { select: { id: true, filename: true, status: true } } },
  orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  take: 100,
}))

export const getOpenReviewTaskForDocument = cache(async (workspaceId: string, documentId: string) => prisma.reviewTask.findFirst({
  where: { workspaceId, documentId, status: { in: ["open", "in_review"] } },
  select: { id: true, status: true },
  orderBy: { createdAt: "desc" },
}))

export const getReviewTask = cache(async (workspaceId: string, taskId: string) => prisma.reviewTask.findFirst({
  where: { id: taskId, workspaceId },
  include: {
    document: true,
    assignee: { select: { id: true, name: true, email: true } },
    createdBy: { select: { id: true, name: true, email: true } },
    workflow: { include: { stages: { orderBy: { stageIndex: "asc" } } } },
  },
}))

/** Every transition is written to DocumentAuditEvent, not just terminal ones — this is the
 * reviewed history WP11's rule-correction flow must only ever append to, never rewrite. */
export async function updateReviewTaskStatus(input: { workspaceId: string; taskId: string; status: ReviewTaskStatus; actorId: string }) {
  const task = await prisma.reviewTask.findFirst({
    where: { id: input.taskId, workspaceId: input.workspaceId },
    select: { id: true, documentId: true, status: true, document: { select: DOCUMENT_PAYMENT_GATE_SELECT } },
  })
  if (!task) throw new Error("review_task_not_found")
  if (input.status === "approved") await assertPaymentConfirmed(input.workspaceId, task.documentId, task.document)
  const context = await getRequestAuditContext()
  const resolvedAt = RESOLVED_STATUSES.has(input.status) ? new Date() : null
  const [updated] = await prisma.$transaction([
    prisma.reviewTask.update({ where: { id: task.id }, data: { status: input.status, resolvedAt } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, documentId: task.documentId, actorId: input.actorId, type: "review_task_status_changed", detail: { from: task.status, to: input.status } }, context) }),
  ])
  return updated
}

/** The workflow-aware counterpart to updateReviewTaskStatus (Dext-parity Phase 3 WP3.1): for a
 * task with a workflow attached, a single "approve"/"reject" decision on its *current* stage,
 * never a direct status write — approving mid-workflow only ever advances currentStageIndex and
 * keeps status "in_review" until the last stage clears. Throws review_task_has_no_workflow for a
 * plain task; callers (WP3.2's actions layer) are expected to branch on task.workflowId and call
 * updateReviewTaskStatus for the plain case instead of routing everything through here. */
export async function decideReviewTaskStage(input: { workspaceId: string; taskId: string; decision: "approve" | "reject"; actorId: string; actorRole: "owner" | "member"; note?: string | null }) {
  const task = await prisma.reviewTask.findFirst({
    where: { id: input.taskId, workspaceId: input.workspaceId },
    include: {
      workflow: { include: { stages: { orderBy: { stageIndex: "asc" } } } },
      document: { select: DOCUMENT_PAYMENT_GATE_SELECT },
    },
  })
  if (!task) throw new Error("review_task_not_found")
  if (!task.workflow || task.currentStageIndex === null) throw new Error("review_task_has_no_workflow")

  const stages = toWorkflowStageInputs(task.workflow.stages)
  const currentStage = findCurrentStage(stages, task.currentStageIndex)
  if (!currentStage) throw new Error("workflow_stage_not_found")
  if (!canDecideStage({ stage: currentStage, actorRole: input.actorRole, actorId: input.actorId })) throw new Error("stage_requires_owner")

  const result = decideStage({ stages, currentStageIndex: task.currentStageIndex, decision: input.decision })
  // The workflow's last stage clearing is the only way this reaches "approved" — an intermediate
  // advance stays "in_review", and a reject never needs the gate at all.
  if (result.outcome === "approved") await assertPaymentConfirmed(input.workspaceId, task.documentId, task.document)
  const nextStatus = result.outcome === "advance" ? "in_review" : result.outcome
  const nextStageIndex = result.outcome === "advance" ? result.nextStageIndex : task.currentStageIndex
  const resolvedAt = result.outcome === "advance" ? null : new Date()

  // A reject can carry the decider's note. It lands in two places: the audit event (the durable
  // "who/why" trail the activity page reads) and, when the task has no detail yet, the task's own
  // detail — so the queue row explains itself without a click. Never overwrites an existing
  // detail: that text says why the task was raised, which the note doesn't replace.
  const note = input.note?.trim() || null
  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.reviewTask.update({ where: { id: task.id }, data: { status: nextStatus, currentStageIndex: nextStageIndex, resolvedAt, ...(note && !task.detail ? { detail: note } : {}) } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, documentId: task.documentId, actorId: input.actorId, type: "review_task_stage_decided", detail: { stageIndex: currentStage.stageIndex, stageName: currentStage.name, decision: input.decision, outcome: result.outcome, ...(note ? { note } : {}) } }, context) }),
  ])
  return updated
}

/** Scoped updateMany, per the roadmap's "bulk actions = scoped updateMany" — but a per-row audit
 * event still has to exist for each task actually changed, since the audit trail is what has to
 * answer "who approved this specific document" later, not just "a bulk approval happened". */
export async function bulkUpdateReviewTaskStatus(input: { workspaceId: string; taskIds: string[]; status: ReviewTaskStatus; actorId: string }) {
  const tasks = await prisma.reviewTask.findMany({
    where: { id: { in: input.taskIds.slice(0, 200) }, workspaceId: input.workspaceId },
    select: { id: true, documentId: true, status: true, document: { select: DOCUMENT_PAYMENT_GATE_SELECT } },
  })
  if (!tasks.length) return { updated: 0, blockedTaskIds: [] as string[], documentIds: [] as string[] }

  // A bulk approve is a batch of otherwise-independent decisions, so one document missing its
  // payment confirmation withholds only that document — never turns a 40-document approval into an
  // all-or-nothing failure over the one nobody checked yet. blockedTaskIds (not just a count) is
  // what lets the client's optimistic list state be corrected for exactly the rows that did not
  // move, rather than either trusting every row moved or reverting all of them.
  const [approvable, blocked] = input.status === "approved"
    ? await partitionByPaymentGate(input.workspaceId, tasks)
    : [tasks, [] as typeof tasks]
  const blockedTaskIds = blocked.map((task) => task.id)
  if (!approvable.length) return { updated: 0, blockedTaskIds, documentIds: [] as string[] }

  const context = await getRequestAuditContext()
  const resolvedAt = RESOLVED_STATUSES.has(input.status) ? new Date() : null
  await prisma.$transaction([
    prisma.reviewTask.updateMany({ where: { id: { in: approvable.map((task) => task.id) }, workspaceId: input.workspaceId }, data: { status: input.status, resolvedAt } }),
    ...approvable.map((task) => prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, documentId: task.documentId, actorId: input.actorId, type: "review_task_status_changed", detail: { from: task.status, to: input.status, bulk: true } }, context) })),
  ])
  return { updated: approvable.length, blockedTaskIds, documentIds: approvable.map((task) => task.documentId) }
}

/** #218: the workflow's full stage list plus where the task currently sits, for the Approval tab's
 * pending-stage rows. Only an active (open/in_review) task has stages left to decide — a settled
 * task's ApprovalStepChain is already fully explained by listDocumentStageDecisions, so this
 * returns null once the document's workflow task is resolved (or it never had one). Deliberately
 * the raw workflow stage list, not applicableStages()-filtered: decideReviewTaskStage itself
 * doesn't apply the amount threshold either (see its own toWorkflowStageInputs call above), so
 * showing anything narrower here would claim a precision the decision path doesn't have yet. */
export async function getActiveWorkflowStageState(workspaceId: string, documentId: string) {
  const task = await prisma.reviewTask.findFirst({
    where: { workspaceId, documentId, workflowId: { not: null }, status: { in: ["open", "in_review"] } },
    select: {
      currentStageIndex: true,
      workflow: { select: { stages: { orderBy: { stageIndex: "asc" }, select: { stageIndex: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  })
  if (!task || !task.workflow || task.currentStageIndex === null) return null
  return { currentStageIndex: task.currentStageIndex, stages: task.workflow.stages }
}

/** Assignment is its own audit event, distinct from a status change — "who is responsible" and
 * "what happened to it" are different questions a compliance review might ask separately. */
export async function assignReviewTask(input: { workspaceId: string; taskId: string; assigneeId: string | null; actorId: string }) {
  const task = await prisma.reviewTask.findFirst({ where: { id: input.taskId, workspaceId: input.workspaceId }, select: { id: true, documentId: true } })
  if (!task) throw new Error("review_task_not_found")
  if (input.assigneeId) {
    const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.assigneeId } }, select: { id: true } })
    if (!member) throw new Error("assignee_not_a_member")
  }
  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.reviewTask.update({ where: { id: task.id }, data: { assigneeId: input.assigneeId } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, documentId: task.documentId, actorId: input.actorId, type: "review_task_assigned", detail: { assigneeId: input.assigneeId } }, context) }),
  ])
  return updated
}

/** When a reviewer approves an ai_suggestion task, the AI coding is confirmed: codingSource
 * flips to "manual" (reviewer has signed off) and we track the acceptance for analytics. Called
 * from the server action layer after any approval, same pattern as maybeAutopublish. */
export async function maybeConfirmAiCoding(workspaceId: string, documentId: string, actorId: string) {
  const task = await prisma.reviewTask.findFirst({
    where: { workspaceId, documentId, reason: "ai_suggestion", status: "approved" },
    select: { id: true },
  })
  if (!task) return
  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: { codingSource: true },
  })
  if (doc?.codingSource !== "ai") return
  await prisma.document.update({
    where: { id: documentId },
    data: { codingSource: "manual", codingConfidence: null },
  })
  await track("ai_coding_accepted", { documentId }, { workspaceId, actorId })
}

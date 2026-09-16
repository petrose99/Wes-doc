// Deliberately NOT a "use server" module, matching models/bills.ts and models/exceptions.ts:
// server actions upstream do the auth and hand this the workspaceId/actor it trusts.
import { prisma } from "@/lib/db"
import { canDecideStage, findCurrentStage, toWorkflowStageInputs, type WorkflowStageInput } from "@/lib/approvals/engine"
import { computeApprovalEligibility, stageHasEligibleApprover, type ApprovalEligibility } from "@/lib/approvals/row-eligibility"
import { listOpenGatesForDocuments, type OpenGateSummary } from "@/lib/gates/list"
import { MATCH_VARIANCE_GATE_TYPE } from "@/lib/gates/match-variance"
import type { WorkspaceRole } from "@/models/workspaces"

/** #236 (Wayfinder map #177): the Approvals destination's two queues — Invoices (every submitted
 * Approval) and PO Mismatches (the slice of those with an open match-variance gate) — both read
 * from the same base set: a ReviewTask with a workflow attached, sitting at a stage, still in
 * flight (CONTEXT.md's "Approval": "a run started on an invoice by a person, moving through the
 * stages of an approval flow"). A ReviewTask with no workflow is a plain review, not an Approval,
 * and never appears here — most ReviewTasks are exactly that (decision #1's five workflow-less
 * call sites: document-checks.ts, automation-rules.ts, integration-push.ts, readiness/refresh.ts,
 * document-matches.ts). */

export type ApprovalActor = { userId: string; role: WorkspaceRole }

export type ApprovalStageInfo = { index: number; total: number; name: string }

export type ApprovalInvoiceRow = {
  taskId: string
  documentId: string
  filename: string
  supplier: string | null
  invoiceNumber: string | null
  total: number | null
  currencyCode: string | null
  dueDate: Date | null
  stage: ApprovalStageInfo
  /** When the task last moved (created, or its currentStageIndex last advanced) — ReviewTask's
   * own `updatedAt`, which `decideReviewTaskStage` bumps on every advance. */
  waitingSince: Date
  /** `canDecideStage` for the actor this row was loaded for — the Approver · Me / Anyone facet
   * filters on this, and the Approve/Reject footer disables itself when it's false. */
  canDecide: boolean
  eligibility: ApprovalEligibility
}

export type PoMismatchRow = {
  gateId: string
  taskId: string
  documentId: string
  filename: string
  supplier: string | null
  invoiceNumber: string | null
  poNumber: string | null
  currencyCode: string | null
  invoiceTotal: number
  poTotal: number
  variance: number
  threshold: number
  percent: number
  floorAmount: number
  matchType: "2-way" | "3-way"
  stage: ApprovalStageInfo
  waitingSince: Date
  canDecide: boolean
  eligibility: ApprovalEligibility
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
function asDate(value: unknown): Date | null {
  if (typeof value !== "string") return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** lib/approvals/engine.ts's canDecideStage/stageHasEligibleApprover only know "owner" | "member"
 * — same collapse review-actions.ts's decideReviewTaskStageAction already does for the "reviewer"
 * role, which the engine treats as a plain member. */
function engineRole(role: WorkspaceRole): "owner" | "member" {
  return role === "owner" ? "owner" : "member"
}

type SubmittedApprovalTask = {
  id: string
  documentId: string
  currentStageIndex: number
  updatedAt: Date
  stages: WorkflowStageInput[]
  document: { id: string; filename: string; reviewedData: unknown; cancelledAt: Date | null }
}

type SubmittedApprovalsContext = {
  tasks: SubmittedApprovalTask[]
  openGatesByDocument: Map<string, OpenGateSummary[]>
  openExceptionDocIds: Set<string>
  memberIds: Set<string>
  hasOwnerMember: boolean
}

/** The shared loader every list/count function below builds on, so the eligibility/canDecide
 * logic (decisions #2/#5/#9) is computed exactly once per task regardless of how many views read
 * it. Excludes a cancelled invoice's Approval outright (#220's cancellation is terminal and has
 * nothing left to decide) rather than surfacing it as some fourth eligibility state. */
async function loadSubmittedApprovals(workspaceId: string): Promise<SubmittedApprovalsContext> {
  const rows = await prisma.reviewTask.findMany({
    where: { workspaceId, workflowId: { not: null }, currentStageIndex: { not: null }, status: "in_review" },
    select: {
      id: true, documentId: true, currentStageIndex: true, updatedAt: true,
      workflow: { select: { stages: { orderBy: { stageIndex: "asc" } } } },
      document: { select: { id: true, filename: true, reviewedData: true, cancelledAt: true, template: { select: { code: true } } } },
    },
    orderBy: { updatedAt: "asc" },
  })
  const tasks: SubmittedApprovalTask[] = rows
    .filter((row) => row.workflow && row.currentStageIndex !== null && row.document.template?.code === "invoice" && !row.document.cancelledAt)
    .map((row) => ({
      id: row.id,
      documentId: row.documentId,
      currentStageIndex: row.currentStageIndex!,
      updatedAt: row.updatedAt,
      stages: toWorkflowStageInputs(row.workflow!.stages),
      document: { id: row.document.id, filename: row.document.filename, reviewedData: row.document.reviewedData, cancelledAt: row.document.cancelledAt },
    }))

  const documentIds = tasks.map((task) => task.documentId)
  if (!documentIds.length) return { tasks: [], openGatesByDocument: new Map(), openExceptionDocIds: new Set(), memberIds: new Set(), hasOwnerMember: false }

  const [openGatesByDocument, openEscalations, members] = await Promise.all([
    listOpenGatesForDocuments(workspaceId, documentIds),
    // Same open-escalation shape as models/exceptions.ts / models/bills.ts: a null
    // escalationStatus predates the #210 migration and counts as open.
    prisma.documentCheckResult.findMany({
      where: { workspaceId, documentId: { in: documentIds }, status: "escalated", OR: [{ escalationStatus: null }, { escalationStatus: { in: ["open", "in_review"] } }] },
      select: { documentId: true },
    }),
    prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true, role: true } }),
  ])
  return {
    tasks,
    openGatesByDocument,
    openExceptionDocIds: new Set(openEscalations.map((row) => row.documentId)),
    memberIds: new Set(members.map((member) => member.userId)),
    hasOwnerMember: members.some((member) => member.role === "owner"),
  }
}

/** Per-task derived facts shared by every row shape: which stage it's sitting at, whether the
 * given actor can decide it right now, and its eligibility (decision #5's "Not eligible" / #10's
 * "no approver"). */
function deriveRowFacts(task: SubmittedApprovalTask, actor: ApprovalActor, ctx: SubmittedApprovalsContext) {
  const currentStage = findCurrentStage(task.stages, task.currentStageIndex)
  const stage: ApprovalStageInfo = { index: task.currentStageIndex, total: task.stages.length, name: currentStage?.name ?? "Unknown stage" }
  const canDecide = currentStage ? canDecideStage({ stage: currentStage, actorRole: engineRole(actor.role), actorId: actor.userId }) : false
  const approverStillValid = currentStage ? stageHasEligibleApprover(currentStage, ctx.memberIds, ctx.hasOwnerMember) : true
  const gates = ctx.openGatesByDocument.get(task.documentId) ?? []
  const eligibility = computeApprovalEligibility({
    hasOpenException: ctx.openExceptionDocIds.has(task.documentId),
    hasBlockedHardGate: gates.some((gate) => gate.severity === "hard"),
    approverStillValid,
  })
  return { stage, canDecide, eligibility, gates }
}

/** Approvals › Invoices (decision #1): every submitted Approval in the workspace. Filtering by
 * the Status ("Ready to approve" / "Not eligible") and Approver ("Me" / "Anyone") chips happens
 * at the route, same as Invoices' own aging-bucket filter — every row here carries what both
 * facets need (`eligibility`, `canDecide`) already computed. */
export async function listApprovalInvoiceRows(workspaceId: string, actor: ApprovalActor): Promise<ApprovalInvoiceRow[]> {
  const ctx = await loadSubmittedApprovals(workspaceId)
  return ctx.tasks.map((task) => {
    const { stage, canDecide, eligibility } = deriveRowFacts(task, actor, ctx)
    const values = (task.document.reviewedData ?? {}) as Record<string, unknown>
    return {
      taskId: task.id,
      documentId: task.documentId,
      filename: task.document.filename,
      supplier: asString(values.vendor) ?? asString(values.merchant),
      invoiceNumber: asString(values.invoice_number),
      total: asNumber(values.total) ?? asNumber(values.amount),
      currencyCode: asString(values.currency_code),
      dueDate: asDate(values.due_date),
      stage,
      waitingSince: task.updatedAt,
      canDecide,
      eligibility,
    }
  })
}

/** Approvals › PO Mismatches (decisions #3/#4): the slice of the same submitted-Approval set that
 * also has an open `match-variance` Gate — appears automatically once the gate fires on an
 * invoice with a decidable stage, no separate Start action of its own. */
export async function listPoMismatchRows(workspaceId: string, actor: ApprovalActor): Promise<PoMismatchRow[]> {
  const ctx = await loadSubmittedApprovals(workspaceId)
  const rows: PoMismatchRow[] = []
  for (const task of ctx.tasks) {
    const gates = ctx.openGatesByDocument.get(task.documentId) ?? []
    const mismatch = gates.find((gate) => gate.gateType === MATCH_VARIANCE_GATE_TYPE)
    if (!mismatch) continue
    const { stage, canDecide, eligibility } = deriveRowFacts(task, actor, ctx)
    const payload = (mismatch.payload ?? {}) as Record<string, unknown>
    const values = (task.document.reviewedData ?? {}) as Record<string, unknown>
    const floor = (payload.floor ?? {}) as Record<string, unknown>
    rows.push({
      gateId: mismatch.id,
      taskId: task.id,
      documentId: task.documentId,
      filename: task.document.filename,
      supplier: asString(values.vendor) ?? asString(values.merchant),
      invoiceNumber: asString(values.invoice_number),
      poNumber: asString(values.po_number) ?? asString(values.purchase_order_number),
      currencyCode: asString(values.currency_code),
      invoiceTotal: asNumber(payload.invoiceTotal) ?? 0,
      poTotal: asNumber(payload.anchorTotal) ?? 0,
      variance: asNumber(payload.variance) ?? 0,
      threshold: asNumber(payload.threshold) ?? 0,
      percent: asNumber(payload.percent) ?? 0,
      floorAmount: asNumber(floor.amount) ?? 0,
      matchType: payload.matchType === "3-way" ? "3-way" : "2-way",
      stage,
      waitingSince: task.updatedAt,
      canDecide,
      eligibility,
    })
  }
  return rows
}

/** The rail badge (decision #9): the signed-in actor's own Ready-to-Approve count across BOTH
 * queues, never the workspace-wide count. Counted off the shared task set once — a task that is
 * also a PO Mismatch is still only one row of work, so it is never counted twice just because it
 * shows up in both queues. */
export async function countReadyToApprove(workspaceId: string, actor: ApprovalActor): Promise<number> {
  const ctx = await loadSubmittedApprovals(workspaceId)
  let count = 0
  for (const task of ctx.tasks) {
    const { canDecide, eligibility } = deriveRowFacts(task, actor, ctx)
    if (canDecide && eligibility.status === "ready") count += 1
  }
  return count
}

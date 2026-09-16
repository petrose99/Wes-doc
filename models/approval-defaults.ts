// Deliberately NOT a "use server" module, matching models/approval-workflows.ts: these helpers
// trust the workspaceId they are handed. The server actions do the auth + owner gate first.
import { auditEventData, getRequestAuditContext } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { cache } from "react"

/** #253: how far back the "would have auto-started" estimate looks. Thirty days is the window the
 * rest of Admin quotes when it puts a number behind a setting, so a reader comparing two settings
 * is comparing the same span. */
export const AUTO_START_ESTIMATE_DAYS = 30

export type DefaultApprovalFlow = {
  id: string
  name: string
  /** False when the flow the workspace points at has since been deactivated. Auto-start does not
   * fire for an inactive flow — the page has to be able to say so rather than imply it is running. */
  active: boolean
}

/** The workspace's default flow, or null when approvals start by hand. Returns the workflow's own
 * `active` so the caller can distinguish "no default" from "a default that cannot fire". */
export const getDefaultApprovalFlow = cache(async (workspaceId: string): Promise<DefaultApprovalFlow | null> => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { defaultApprovalWorkflow: { select: { id: true, name: true, active: true } } },
  })
  return workspace?.defaultApprovalWorkflow ?? null
})

/** Points the workspace at a flow, or clears it (`workflowId: null`).
 *
 * Forward-only by design: this never reaches into ReviewTasks that already exist. Retro-attaching
 * a workflow to work someone is already holding would change the state of another person's queue
 * without them acting — the confirm copy promises it does not, and this is where that promise is
 * kept. */
export async function setDefaultApprovalFlow(input: {
  workspaceId: string
  workflowId: string | null
  actorId: string
}) {
  if (input.workflowId) {
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: { id: input.workflowId, workspaceId: input.workspaceId },
      select: { id: true },
    })
    if (!workflow) throw new Error("approval_workflow_not_found")
  }
  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.workspace.update({
      where: { id: input.workspaceId },
      data: { defaultApprovalWorkflowId: input.workflowId },
    }),
    prisma.documentAuditEvent.create({
      data: auditEventData({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        type: input.workflowId ? "default_approval_flow_set" : "default_approval_flow_cleared",
        detail: { workflowId: input.workflowId },
      }, context),
    }),
  ])
  return updated
}

/** A document is "blocked" for auto-start purposes when it carries an open hard gate. Soft gates
 * are workspace-tunable and dismissible, so they do not hold an approval back; a hard gate is the
 * thing the consequence sentence means by "no blocking check".
 *
 * Kept as one exported function because two places need the same rule — the estimate below and the
 * live auto-start — and the #250 lesson is that a number summarising something must read from the
 * single function the thing itself reads from, never a second computation that drifts. */
export async function documentIdsWithBlockingGate(workspaceId: string, documentIds: string[]): Promise<Set<string>> {
  if (!documentIds.length) return new Set()
  const gates = await prisma.gate.findMany({
    where: { workspaceId, documentId: { in: documentIds }, severity: "hard", state: "blocked" },
    select: { documentId: true },
  })
  return new Set(gates.map((gate) => gate.documentId))
}

/** How many invoices in the last 30 days would have started a flow on their own, had a default
 * been set then. Counts review tasks that were created without a workflow (the ones a default
 * would have caught) on documents that carried no blocking hard gate.
 *
 * This is an estimate and says so on the surface: it is computed against today's gate state, not
 * the gate state at the time each task was created, because gate history is not retained per-day.
 * Over-stating would be the dangerous direction, so a gate that is open *now* excludes the
 * document even if it fired after the task was made. */
export async function estimateAutoStarts(workspaceId: string, days = AUTO_START_ESTIMATE_DAYS): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const tasks = await prisma.reviewTask.findMany({
    where: { workspaceId, workflowId: null, createdAt: { gte: since } },
    select: { documentId: true },
    take: 5000,
  })
  if (!tasks.length) return 0
  const documentIds = [...new Set(tasks.map((task) => task.documentId))]
  const blocked = await documentIdsWithBlockingGate(workspaceId, documentIds)
  return tasks.filter((task) => !blocked.has(task.documentId)).length
}

/** The In-review hook. Returns the workflow id a task being created for this document should start
 * against, or null to leave it a plain single-decision task.
 *
 * Three ways this returns null, all of them deliberate:
 *  - the workspace has no default (approvals start by hand — the shipped behaviour),
 *  - the default flow has been deactivated (an inactive flow must not keep firing invisibly),
 *  - the document carries an open hard gate (the "no blocking check" half of the promise).
 *
 * #236's manual Start is untouched: it goes through startWorkflowOnReviewTask, which refuses a
 * task that already has a workflow, so an auto-started task simply shows as already started
 * rather than offering a second, competing start. */
export async function resolveAutoStartWorkflowId(workspaceId: string, documentId: string): Promise<string | null> {
  const flow = await getDefaultApprovalFlow(workspaceId)
  if (!flow || !flow.active) return null
  const blocked = await documentIdsWithBlockingGate(workspaceId, [documentId])
  return blocked.has(documentId) ? null : flow.id
}

import { cache } from "react"
import { prisma } from "@/lib/db"
import { getMinConfidencePercent } from "@/models/automation-config"
import type { ProcessingFactInput } from "@/lib/documents/processing-fact"

/** #258 (Wayfinder map #226): one document's `ProcessingFactInput`, read the same way
 * `listWorkspaceBills` / `listWorkspaceReceipts` derive it for a whole page of rows — the latest
 * ReviewTask of any status, the open `check_failed` tasks, open escalations, the touchless event,
 * `Document.status` — so the pane's Status line, the stepper's Approval node and the full-mode
 * route print the word the row prints. A test asserts the two derivations agree on the seed
 * workspace; if you change one, change the other.
 *
 * The Approved actor comes from the last `review_task_stage_decided` approve, else the latest
 * `document_reviewed` event — but only when `Document.status === "reviewed"`, because a Save that
 * left required fields missing writes `document_reviewed` too (spec §1.2 last row). */
export type ProcessingStateDetail = ProcessingFactInput & {
  reviewed: { at: string; actorName: string | null } | null
  touchlessThresholdPercent: number | null
}

export const getProcessingStateInput = cache(async (workspaceId: string, documentId: string): Promise<ProcessingStateDetail | null> => {
  const document = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: { status: true, cancelledAt: true, cancelledReason: true, reviewedAt: true, receivedAt: true },
  })
  if (!document) return null
  const [latestTask, openCheckTasks, openEscalations, touchlessEvent, reviewedEvent, stageEvents, minConfidencePercent] = await Promise.all([
    prisma.reviewTask.findFirst({ where: { workspaceId, documentId }, select: { status: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.reviewTask.findMany({ where: { workspaceId, documentId, reason: "check_failed", status: { in: ["open", "in_review"] } }, select: { detail: true } }),
    prisma.documentCheckResult.findMany({ where: { workspaceId, documentId, status: "escalated", OR: [{ escalationStatus: null }, { escalationStatus: { in: ["open", "in_review"] } }] }, select: { id: true } }),
    prisma.documentAuditEvent.findFirst({ where: { workspaceId, documentId, type: "push.touchless_enqueued" }, select: { id: true } }),
    prisma.documentAuditEvent.findFirst({ where: { workspaceId, documentId, type: "document_reviewed" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, actor: { select: { name: true, email: true } } } }),
    prisma.documentAuditEvent.findMany({ where: { workspaceId, documentId, type: "review_task_stage_decided" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, detail: true, actor: { select: { name: true, email: true } } } }),
    getMinConfidencePercent(workspaceId),
  ])
  const latestStatus = latestTask?.status
  const approvalStatus: ProcessingFactInput["approvalStatus"] =
    document.cancelledAt ? "cancelled" :
    latestStatus === "rejected" ? "rejected" :
    latestStatus === "in_review" ? "in_progress" :
    latestStatus === "open" ? "not_started" :
    "approved"
  const lastDecision = stageEvents.map((event) => ({ event, detail: event.detail as { decision?: "approve" | "reject" } | null })).find((item) => item.detail?.decision)
  const actorOf = (actor: { name: string | null; email: string | null } | null) => actor?.name || actor?.email || null
  const reviewed = document.status === "reviewed"
    ? lastDecision?.detail?.decision === "approve"
      ? { at: lastDecision.event.createdAt.toISOString(), actorName: actorOf(lastDecision.event.actor) }
      : reviewedEvent
        ? { at: reviewedEvent.createdAt.toISOString(), actorName: actorOf(reviewedEvent.actor) }
        : document.reviewedAt ? { at: document.reviewedAt.toISOString(), actorName: null } : null
    : null
  return {
    approvalStatus,
    blockedByCheck: openCheckTasks.length > 0,
    escalated: openEscalations.length > 0,
    touchless: touchlessEvent !== null,
    status: document.status,
    cancelledReason: document.cancelledReason ?? null,
    reviewTaskOpenedAt: latestStatus === "open" || latestStatus === "in_review" ? latestTask!.createdAt : null,
    receivedAt: document.receivedAt,
    openCheckCodes: openCheckTasks.map((task) => (task.detail ? task.detail.split(":")[0].trim() : "unknown")),
    approvedBy: reviewed ? { actorName: reviewed.actorName, at: new Date(reviewed.at) } : null,
    rejectedBy: approvalStatus === "rejected" && lastDecision?.detail?.decision === "reject" ? actorOf(lastDecision.event.actor) : null,
    reviewed,
    touchlessThresholdPercent: touchlessEvent ? minConfidencePercent : null,
  }
})

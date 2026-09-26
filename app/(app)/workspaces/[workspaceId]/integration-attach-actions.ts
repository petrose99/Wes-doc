"use server"

/** Server actions for the "attach the source file to the posted ledger bill" feature (#450/ADR
 * 0016). Two actions: Retry attaching (any workspace member, retryable failures only — modelled
 * on retryLedgerPushAction) and the owner-only one-time back-fill for bills that were pushed
 * before this feature existed. */

import { ActionState } from "@/lib/actions"
import { recordDocumentAudit } from "@/lib/audit"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { attemptIntegrationAttachment, kickIntegrationAttachDrain } from "@/lib/integration-attach"
import { PERMANENT_ATTACH_ERROR_CODES } from "@/lib/integration-attach-policy"
import { countBackfillableAttachments, queueBackfillAttachments } from "@/models/integrations"
import { revalidatePath } from "next/cache"
import { errorMessage, NO_ACCESS, requireMember } from "./action-helpers"

/** #461 Checks-tab Retry: only offered (and only honored) for a `failed` attach whose errorCode is
 * NOT one of the ADR's five permanent codes — a permanent failure would just fail again the same
 * way, so retrying it is refused rather than silently wasting an attempt. */
export async function retryAttachingAction(workspaceId: string, documentId: string): Promise<ActionState<{ status: string }>> {
  if (!config.integrations.enabled) return { success: false, error: errorMessage(new Error("integrations_not_available"), NO_ACCESS) }
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }

  try {
    const attachment = await prisma.integrationAttachment.findFirst({
      where: { workspaceId, documentId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, errorCode: true },
    })
    if (!attachment) return { success: false, error: "No attach attempt found for this document" }
    if (attachment.status !== "failed") return { success: false, error: "This attach isn't in a failed state" }
    if (attachment.errorCode && PERMANENT_ATTACH_ERROR_CODES.has(attachment.errorCode)) {
      return { success: false, error: "This attach failed permanently and can't be retried" }
    }

    await prisma.integrationAttachment.update({
      where: { id: attachment.id },
      data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), leaseUntil: null, errorCode: null, completedAt: null },
    })
    await attemptIntegrationAttachment(attachment.id)
    const updated = await prisma.integrationAttachment.findUnique({ where: { id: attachment.id }, select: { status: true } })
    if (updated?.status === "pending") await kickIntegrationAttachDrain()

    await recordDocumentAudit({ workspaceId, actorId: user.id, documentId, type: "integration_attach_retried", detail: { attachmentId: attachment.id } })
    revalidatePath(`/workspaces/${workspaceId}/documents/${documentId}`)
    return { success: true, data: { status: updated?.status ?? "pending" } }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not retry attaching this file") }
  }
}

/** Owner-only: how many succeeded pushes in this workspace predate the attach feature. Shown
 * before the owner commits to running the back-fill. */
export async function countBackfillableAttachmentsAction(workspaceId: string): Promise<ActionState<{ count: number }>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: NO_ACCESS }
  const count = await countBackfillableAttachments(workspaceId)
  return { success: true, data: { count } }
}

/** Owner-only one-time back-fill: enqueues an attach for every succeeded push that has none yet.
 * Idempotent (models/integrations.ts's `attachment: null` filter excludes anything already
 * queued), so running it more than once is harmless, not just permitted. */
export async function backfillAttachSourceFilesAction(workspaceId: string): Promise<ActionState<{ queued: number }>> {
  if (!config.integrations.enabled) return { success: false, error: errorMessage(new Error("integrations_not_available"), NO_ACCESS) }
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: NO_ACCESS }

  try {
    const queued = await queueBackfillAttachments(workspaceId)
    await recordDocumentAudit({ workspaceId, actorId: user.id, documentId: null, type: "integration_attach_backfill", detail: { queued } })
    revalidatePath(`/workspaces/${workspaceId}/accounting`)
    return { success: true, data: { queued } }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not back-fill source-file attaches") }
  }
}

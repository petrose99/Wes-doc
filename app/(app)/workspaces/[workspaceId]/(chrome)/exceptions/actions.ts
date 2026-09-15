"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { recordDocumentAudit } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import type { ExceptionResolution } from "@/models/exceptions"
import { requireMember, paths } from "../../action-helpers"

async function loadOpenCheck(workspaceId: string, checkResultId: string) {
  const check = await prisma.documentCheckResult.findUnique({ where: { id: checkResultId } })
  if (!check || check.workspaceId !== workspaceId || check.status !== "escalated") return null
  return check
}

/** #210: Open -> In review. Zero-friction pickup, matching ReviewTask's own low-ceremony pattern
 * — no reason required to start looking at something, only to resolve it. */
export async function startExceptionReviewAction(workspaceId: string, checkResultId: string): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: "You no longer have access to this workspace" }
  const check = await loadOpenCheck(workspaceId, checkResultId)
  if (!check) return { success: false, error: "This exception no longer exists" }
  await prisma.documentCheckResult.update({ where: { id: check.id }, data: { escalationStatus: "in_review", escalationAssigneeId: user.id } })
  await recordDocumentAudit({ workspaceId, documentId: check.documentId, actorId: user.id, type: "check.escalation_started", detail: { checkCode: check.checkCode } })
  revalidatePath(paths(workspaceId).exceptions)
  return { success: true }
}

const RESOLUTION_LABEL: Record<ExceptionResolution, string> = {
  corrected: "Corrected",
  vendor_accepted: "Vendor contacted, accepted as-is",
  false_positive: "Dismissed as false positive",
}

/** #210: -> Resolved, along one of three named paths. Mirrors the reason+attribution+audit-event
 * shape `overrideGate`/`escalateCheckAction` already use elsewhere — not a literal Gate override,
 * since an escalated check isn't a Gate row (see models/exceptions.ts and DocumentCheckResult's
 * escalation* fields for why). `formData` carries the reason under "reason", matching
 * ReasonDialogButton's contract so this action can be bound straight to it. */
export async function resolveExceptionAction(workspaceId: string, checkResultId: string, resolution: ExceptionResolution, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: "You no longer have access to this workspace" }
  const reason = String(formData.get("reason") || "").trim()
  if (!reason) return { success: false, error: "A reason is required." }
  const check = await loadOpenCheck(workspaceId, checkResultId)
  // Note on "corrected": saving a fixed field re-runs the check (runDeterministicChecks) and
  // flips `status` away from "escalated" on its own — at that point the row has already dropped
  // out of loadOpenCheck/the queue, so a person rarely reaches this action to record it. This
  // path exists for the case where they resolve it here anyway (e.g. the recompute hasn't run
  // yet, or the fix happened outside the field editor) — it's the reviewer's assertion, same as
  // the original Escalate action was, not a re-verified fact.
  if (!check) return { success: false, error: "This exception no longer exists" }
  await prisma.documentCheckResult.update({
    where: { id: check.id },
    data: { escalationStatus: "resolved", escalationResolution: resolution, escalationResolutionNote: reason, escalationResolvedById: user.id, escalationResolvedAt: new Date() },
  })
  await recordDocumentAudit({ workspaceId, documentId: check.documentId, actorId: user.id, type: "check.escalation_resolved", detail: { checkCode: check.checkCode, resolution, resolutionLabel: RESOLUTION_LABEL[resolution], reason } })
  revalidatePath(paths(workspaceId).exceptions)
  revalidatePath(`${paths(workspaceId).documents}/${check.documentId}`)
  return { success: true }
}

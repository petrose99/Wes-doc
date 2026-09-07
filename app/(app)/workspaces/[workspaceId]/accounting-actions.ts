"use server"

/** Server actions for the Accounting tab's Bigcapital connection card: re-provisioning (first
 * attempt or repair after a failure). Everything else the tab needs — sync now, default account
 * picker, disconnect — is already provider-agnostic in integration-connection-actions.ts and is
 * reused there rather than duplicated. */

import { ActionState } from "@/lib/actions"
import { recordDocumentAudit } from "@/lib/audit"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { enqueueBigcapitalProvisionJob, getWorkspaceProvisionJob } from "@/models/bigcapital"
import { getWorkspaceIntegrationConnection } from "@/models/integrations"
import { revalidatePath } from "next/cache"
import { errorMessage, NO_ACCESS, paths, requireMember } from "./action-helpers"

async function guardAccounting(workspaceId: string): Promise<{ userId: string } | { error: string }> {
  if (!config.integrations.bigcapital.enabled) return { error: "accounting_not_available" }
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { error: NO_ACCESS }
  return { userId: user.id }
}

export async function getBigcapitalStatusAction(workspaceId: string) {
  const [connection, job] = await Promise.all([
    getWorkspaceIntegrationConnection(workspaceId, "bigcapital"),
    getWorkspaceProvisionJob(workspaceId),
  ])
  return { connection, job }
}

/** Wipes the workspace's stored Bigcapital account, connection, provisioned entities and job — the
 * escape hatch when a stored password can no longer be decrypted (SECRETS_ENCRYPTION_KEY rotated
 * without re-encrypting) and repair alone can't recover, since the existing row is what's broken.
 * Then re-enqueues provisioning so the workspace starts over with a fresh account and key. */
export async function resetBigcapitalConnectionAction(workspaceId: string): Promise<ActionState> {
  const gate = await guardAccounting(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  try {
    await prisma.$transaction([
      prisma.bigcapitalAccount.deleteMany({ where: { workspaceId } }),
      prisma.integrationConnection.deleteMany({ where: { workspaceId, provider: "bigcapital" } }),
      prisma.integrationProvisionJob.deleteMany({ where: { workspaceId, provider: "bigcapital" } }),
    ])
    await enqueueBigcapitalProvisionJob(workspaceId, gate.userId)
    await recordDocumentAudit({ workspaceId, actorId: gate.userId, type: "bigcapital_provision_enqueued", detail: { isRepair: true, reason: "reset" } })
    revalidatePath(paths(workspaceId).accounting)
    return { success: true }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not reset connection") }
  }
}

/** Starts (or restarts, after a failure) provisioning this workspace's Bigcapital organization. Idempotent:
 * re-running it while a job is already pending/succeeded just resets the same row to a fresh attempt cycle. */
export async function repairBigcapitalConnectionAction(workspaceId: string): Promise<ActionState> {
  const gate = await guardAccounting(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  try {
    await enqueueBigcapitalProvisionJob(workspaceId, gate.userId)
    await recordDocumentAudit({ workspaceId, actorId: gate.userId, type: "bigcapital_provision_enqueued", detail: { isRepair: true } })
    revalidatePath(paths(workspaceId).accounting)
    return { success: true }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not start provisioning") }
  }
}

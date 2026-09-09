"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/auth"
import { updateAutomationConfig, type AutomationConfigUpdate } from "@/models/automation-config"
import { requireWorkspaceRole } from "@/models/workspaces"

/** Owner-only action that persists a patch to WorkspaceAutomationConfig. Every field is optional
 * — the form submits only what the reviewer changed. */
export async function updateAutomationConfigAction(input: {
  workspaceId: string
  patch: AutomationConfigUpdate
}): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await getCurrentUser()
    await requireWorkspaceRole(input.workspaceId, user.id, ["owner"])
    await updateAutomationConfig({ workspaceId: input.workspaceId, actorId: user.id, patch: input.patch })
    revalidatePath(`/workspaces/${input.workspaceId}/settings/automation`)
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "automation_config_update_failed"
    return { error: message }
  }
}

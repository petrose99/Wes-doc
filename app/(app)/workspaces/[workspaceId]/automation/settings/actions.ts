"use server"

import { revalidatePath } from "next/cache"
import { ZodError } from "zod"

import { estimateTouchlessImpact, type TouchlessImpactEstimate } from "@/lib/analytics/workspace-analytics"
import { getCurrentUser } from "@/lib/auth"
import { updateAutomationConfig, type AutomationConfigUpdate } from "@/models/automation-config"
import { requireWorkspaceRole } from "@/models/workspaces"

/** Translates a rejected patch into the sentence a reviewer actually needs, instead of a
 * stringified Zod issue list or a bare Prisma/JS error message reaching the toast. The product's
 * voice elsewhere in Automation explains mechanisms in plain language ("100% of 5 means all five
 * agreed"); a failed save shouldn't be the one place that voice drops to a stack trace. */
function friendlyConfigError(error: unknown): string {
  if (error instanceof ZodError) {
    const touchesBands = error.issues.some((issue) => issue.path[0] === "amountBands")
    if (touchesBands) return "One of the confidence-by-amount bands is invalid — check that \"Up to\" is at least \"From\", and confidence is between 0 and 1."
    const touchesConfidence = error.issues.some((issue) => issue.path[0] === "minConfidence" || issue.path[0] === "qaSampleRate")
    if (touchesConfidence) return "Confidence and QA sample rate must be between 0 and 1 (for example 0.90, not 90)."
    return "Some of these settings aren't valid — check the highlighted fields and try again."
  }
  return "Couldn't save these settings. Try again in a moment."
}

/** Owner-only action that persists a patch to WorkspaceAutomationConfig. Every field is optional
 * — the form submits only what the reviewer changed. Lives under /automation/settings so all
 * automation-related UI is one place. */
export async function updateAutomationConfigAction(input: {
  workspaceId: string
  patch: AutomationConfigUpdate
}): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await getCurrentUser()
    await requireWorkspaceRole(input.workspaceId, user.id, ["owner"])
    await updateAutomationConfig({ workspaceId: input.workspaceId, actorId: user.id, patch: input.patch })
    revalidatePath(`/workspaces/${input.workspaceId}/automation/settings`)
    return { ok: true }
  } catch (error) {
    return { error: friendlyConfigError(error) }
  }
}

/** Powers the Touchless confirm step: given the confidence bar the form is about to save, how
 * many of the last 30 days' documents would have cleared it. Owner-only, same as the save itself
 * — this is read access to workspace document data, not just config. */
export async function estimateTouchlessImpactAction(input: {
  workspaceId: string
  minConfidence: number
}): Promise<{ ok: true; estimate: TouchlessImpactEstimate } | { error: string }> {
  try {
    const user = await getCurrentUser()
    await requireWorkspaceRole(input.workspaceId, user.id, ["owner"])
    const estimate = await estimateTouchlessImpact(input.workspaceId, input.minConfidence)
    return { ok: true, estimate }
  } catch {
    return { error: "Couldn't estimate the impact right now." }
  }
}

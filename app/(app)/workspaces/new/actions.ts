"use server"

import { ActionState } from "@/lib/actions"
import { getViewerUser } from "@/lib/auth"
import { createWorkspaceForUser, getWorkspacesForUser } from "@/models/workspaces"

/** Creates the brand-new user's first (personal) workspace, instead of the old silent "general"
 * default from getOrCreateWorkspaceForUser's lazy-creation path. The app is finance-only. */
export async function createInitialWorkspaceAction(input: {
  name: string
  country: string
  baseCurrency: string
  timezone: string
  fiscalYearStart: string
}): Promise<ActionState<{ workspaceId: string }>> {
  const user = await getViewerUser()
  if (!user) return { success: false, error: "Not signed in" }
  const existing = await getWorkspacesForUser(user.id)
  if (existing.length) return { success: true, data: { workspaceId: existing[0].id } }
  try {
    const workspace = await createWorkspaceForUser(user, {
      name: input.name.trim() || undefined,
      country: input.country,
      baseCurrency: input.baseCurrency,
      timezone: input.timezone,
      fiscalYearStart: input.fiscalYearStart,
    })
    return { success: true, data: { workspaceId: workspace.id } }
  } catch {
    return { success: false, error: "Could not set up your company" }
  }
}

import { cache } from "react"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { getWorkspaceMembers, requireWorkspaceRole } from "@/models/workspaces"

/** #252: what every Admin page needs before it renders — who is looking, at which company, with
 * what role, and who the owners are (the read-only band names them). Cached per request so the
 * layout and the page share one round of queries. */
export const getAdminContext = cache(async (workspaceId: string) => {
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const [capabilities, members] = await Promise.all([getWorkspaceCapabilities(workspaceId), getWorkspaceMembers(workspaceId)])
  const owner = membership.role === "owner"
  const owners = members.filter((member) => member.role === "owner").map((member) => member.user.name || member.user.email)
  return {
    user,
    membership,
    workspace: membership.workspace,
    owner,
    /** The people a member is told to ask. Never the viewer themself. */
    owners: owners.filter((name) => name !== (user.name || user.email)),
    capabilities,
    integrationsEnabled: config.integrations.enabled,
    members,
  }
})

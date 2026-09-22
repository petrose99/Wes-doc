import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"

/** Narrow reading column for the document detail page and the remaining chrome routes. Top-level
 * navigation lives in the app shell's sidebar one level up. The settings tab strip that used to
 * render here is gone (#252): every `settings/*` address now 308-redirects into Admin, which has
 * its own left nav. */
export default async function WorkspaceChromeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  return <div className="mx-auto w-full max-w-4xl p-6">{children}</div>
}

import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"
import { SearchPageClient } from "./search-client"

export default async function SearchPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const user = await getCurrentUser()
  const { workspaceId } = await params
  await requireWorkspaceRole(workspaceId, user.id)
  const { q } = await searchParams

  // #262: the `/` shortcut lands here with no query at all — an empty, focused search page to
  // type into, not a bounce back to the workspace root. #270: Ask mode retired with the
  // AssistantPanel per #245 decision 7 ("One box, one mode") — no `ask` param anymore.
  return <SearchPageClient workspaceId={workspaceId} initialQuery={q ?? ""} />
}

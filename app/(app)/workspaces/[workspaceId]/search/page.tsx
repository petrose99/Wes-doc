import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"
import { redirect } from "next/navigation"
import { SearchPageClient } from "./search-client"

export default async function SearchPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ q?: string; ask?: string }>
}) {
  const user = await getCurrentUser()
  const { workspaceId } = await params
  await requireWorkspaceRole(workspaceId, user.id)
  const { q, ask } = await searchParams

  // #262: the `/` shortcut lands here with no query at all — an empty, focused search page to
  // type into, not a bounce back to the workspace root. `ask` alone (no `q`) still redirects:
  // Ask mode has nothing to answer without a question.
  if (!q?.trim() && ask === "1") redirect(`/workspaces/${workspaceId}`)

  return <SearchPageClient workspaceId={workspaceId} initialQuery={q ?? ""} askMode={ask === "1"} />
}

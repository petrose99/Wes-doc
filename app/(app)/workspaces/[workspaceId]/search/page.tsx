import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"
import { SearchPageClient } from "./search-client"

export default async function SearchPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ q?: string; gone?: string }>
}) {
  const user = await getCurrentUser()
  const { workspaceId } = await params
  await requireWorkspaceRole(workspaceId, user.id)
  const { q, gone } = await searchParams

  // #262: the `/` shortcut lands here with no query at all — an empty, focused search page to
  // type into, not a bounce back to the workspace root. #270: Ask mode retired with the
  // AssistantPanel per #245 decision 7 ("One box, one mode") — no `ask` param anymore.
  // #270 close: `gone=<id>` arrives via the standalone document route's `goneOrNotFound` redirect
  // (a row clicked between list render and click) — same missing-row banner pattern typed queues
  // use for #268, spec §3 "Result gone since listing".
  return <SearchPageClient workspaceId={workspaceId} initialQuery={q ?? ""} initialGone={!!gone} />
}

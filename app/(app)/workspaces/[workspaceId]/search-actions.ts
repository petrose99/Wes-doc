"use server"

import { getCurrentUser } from "@/lib/auth"
import { parseSearchInput, type SearchResultItem } from "@/lib/global-search"
import { runGlobalSearch } from "@/lib/library-search"
import { searchWorkspaceDocuments, type SearchRow } from "@/models/search"
import { requireWorkspaceRole } from "@/models/workspaces"

export type SearchListResult = {
  rows: SearchRow[]
  total: number
}

export type GlobalSearchResult = {
  items: SearchResultItem[]
  total: number
}

/** components/shell/global-search.tsx's cmd+k widget — a separate surface from #270's Search
 * screen (spec §1 retires Ask AI/Sparkles from *this page*, not the shell's cmd+k palette). Kept
 * as-is so the rewrite below doesn't break an unrelated consumer. */
export async function globalSearchAction(workspaceId: string, query: string): Promise<GlobalSearchResult> {
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  const { items, total } = await runGlobalSearch(workspaceId, query, user.id)
  return { items: items.slice(0, 30), total }
}

/** #270 §1: the one search-list read the Search screen calls. Chip syntax (`type:receipt`,
 * `status:closed`) is parsed once here — a `type`/`status` chip with no other query text feeds the
 * facet predicate directly rather than going through the ranked-search path (which silently drops
 * both today, per lib/global-search.ts's `runGlobalSearch`) so `type:receipt` alone still browses.
 * URL facet params win over an in-box chip of the same kind. */
export async function searchListAction(workspaceId: string, params: {
  q: string
  type?: string
  status?: string
  supplier?: string
  dateFrom?: string
  dateTo?: string
}): Promise<SearchListResult> {
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)

  const chips = parseSearchInput(params.q)
  const urlTypes = params.type ? params.type.split(",").filter(Boolean) : []
  const urlStatuses = params.status ? params.status.split(",").filter(Boolean) : []
  const types = urlTypes.length ? urlTypes : chips.type ? [chips.type] : []
  const statuses = urlStatuses.length ? urlStatuses : chips.status ? [chips.status] : []
  // Malformed chip syntax (H5, spec §2a): parseSearchInput never strips an unmatched prefix, so a
  // typo'd chip just stays in `chips.text` and falls through to the ranked-search path below —
  // no error state to invent.
  const useRanking = chips.text.trim().length > 0 || chips.filters.length > 0

  return searchWorkspaceDocuments(workspaceId, {
    q: useRanking ? params.q : "",
    type: types,
    status: statuses,
    supplier: params.supplier,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  }, user.id)
}

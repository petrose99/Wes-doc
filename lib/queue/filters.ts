/** #257 spec 3.3/3.4: the one reading of a queue's URL filter state that the header chips, the
 * phone lane's Filter button label ("Filter · 2") and the Filter sheet all share — one function,
 * never three counts (B3). Pure, so it is testable without a DOM. */

export type FilterableFacet = {
  param: string
  options?: Array<{ value: string }>
  sections?: Array<{ options: Array<{ value: string }> }>
}

export function facetOptionValues(facet: FilterableFacet): string[] {
  return (facet.sections ? facet.sections.flatMap((section) => section.options) : facet.options ?? []).map((option) => option.value)
}

/** The facet's selected values as the URL carries them, dropping anything not in its option set. */
export function facetSelectedValues(facet: FilterableFacet, params: URLSearchParams): string[] {
  const raw = params.get(facet.param)
  if (!raw) return []
  const valid = new Set(facetOptionValues(facet))
  return raw.split(",").filter((value) => valid.has(value))
}

/** Active facets + 1 when the sort is set to anything but the queue's default. The Queue screen
 * deletes the sort param when the default is chosen, but a shared URL may still carry it
 * explicitly, so the default key is compared, not just the param's presence. */
export function activeFilterCount(params: URLSearchParams, facets: FilterableFacet[], sort: { param: string; defaultKey: string | null }, extraParams: string[] = []): number {
  const facetCount = facets.filter((facet) => facetSelectedValues(facet, params).length > 0).length
    + extraParams.filter((param) => (params.get(param) ?? "").trim() !== "").length
  const sortKey = params.get(sort.param)
  const sortActive = sortKey !== null && sortKey !== "" && sortKey !== sort.defaultKey
  return facetCount + (sortActive ? 1 : 0)
}

/** #261: the one "Clear filters" — every facet param and the sort param go, everything else
 * (`view`, a deep-link `from=`) stays. Shared by the header chips' Clear, the Filter sheet's
 * Clear and the filtered-empty state's default action, so the three can never disagree (B4). */
export function clearFilterParams(params: URLSearchParams, facets: FilterableFacet[], sortParam: string, extraParams: string[] = []): URLSearchParams {
  const next = new URLSearchParams(params.toString())
  next.delete(sortParam)
  for (const facet of facets) next.delete(facet.param)
  // #286: a queue's free-text search (`q`) is a filter too — Clear filters clears it.
  for (const param of extraParams) next.delete(param)
  return next
}

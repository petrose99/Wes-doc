"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Check, Filter } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import type { Facet } from "@/components/queue/facet-filters"
import { activeFilterCount, facetSelectedValues } from "@/lib/queue/filters"

/** #257 spec 3.4: the phone lane's one filter surface — a bottom `Dialog placement="sheet"` with
 * the queue's sort as a radiogroup, one group per `Facet`, and a footer of Clear · "Show n rows".
 * Nothing changes until "Show n rows": the draft lives here, the URL only on apply, same
 * contract as the desktop chips (`FacetFilters`) whose params it writes. The `n` is live because
 * the caller counts the rows the draft would leave (`countFor`), from the same array the list
 * renders — one number, not two computations (B3). */
export function FilterSheet<T>({ open, onClose, facets, sortOptions, sortParam, rows, filterRows }: {
  open: boolean
  onClose: () => void
  facets: Facet[]
  sortOptions: Array<{ key: string; label: string }>
  sortParam: string
  rows: T[]
  /** The queue's own client-side predicate, so the footer count matches the list exactly. */
  filterRows?: (rows: T[], params: URLSearchParams) => T[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const defaultSortKey = sortOptions[0]?.key ?? null
  const [draft, setDraft] = useState<URLSearchParams>(() => new URLSearchParams(searchParams.toString()))
  // Re-seed the draft from the URL each time the sheet opens — a cancelled draft never leaks into
  // the next opening (same rule as ReasonDialog's cancelled reason, #251).
  useEffect(() => { if (open) setDraft(new URLSearchParams(searchParams.toString())) }, [open, searchParams])

  const draftSort = draft.get(sortParam) ?? defaultSortKey
  const setDraftSort = (key: string) => setDraft((prev) => {
    const next = new URLSearchParams(prev.toString())
    if (key === defaultSortKey) next.delete(sortParam); else next.set(sortParam, key)
    return next
  })
  const setDraftFacet = (facet: Facet, values: string[]) => setDraft((prev) => {
    const next = new URLSearchParams(prev.toString())
    if (values.length === 0) next.delete(facet.param); else next.set(facet.param, values.join(","))
    return next
  })
  const toggleFacetValue = (facet: Facet, value: string) => {
    const current = facetSelectedValues(facet, draft)
    if (facet.kind === "multi") setDraftFacet(facet, current.includes(value) ? current.filter((v) => v !== value) : [...current, value])
    else setDraftFacet(facet, current[0] === value ? [] : [value])
  }
  const clear = () => setDraft((prev) => {
    const next = new URLSearchParams(prev.toString())
    next.delete(sortParam)
    for (const facet of facets) next.delete(facet.param)
    return next
  })

  const activeCount = activeFilterCount(draft, facets, { param: sortParam, defaultKey: defaultSortKey })
  const count = (filterRows ? filterRows(rows, draft) : rows).length
  const apply = () => {
    const qs = draft.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
    onClose()
  }

  const row = (props: { key: string; label: string; checked: boolean; onSelect: () => void; role: "radio" | "checkbox"; tabbable: boolean }) =>
    <button key={props.key} type="button" role={props.role} aria-checked={props.checked} tabIndex={props.tabbable ? 0 : -1} onClick={props.onSelect}
      className={`flex h-12 w-full items-center justify-between gap-3 px-5 text-left text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${props.checked ? "font-medium text-slate-900" : "text-slate-700"}`}>
      {props.label}
      {props.checked && <Check className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />}
    </button>

  const onGroupKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role=radio], [role=checkbox]"))
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (index < 0) return
    event.preventDefault()
    const next = items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]
    next.focus()
    next.click()
  }

  return <Dialog open={open} placement="sheet" title="Filter" onClose={onClose} initialFocus="[role=radio][aria-checked=true], [role=checkbox]">
    <div className="max-h-[60vh] overflow-y-auto py-2">
      {sortOptions.length > 1 && <div role="radiogroup" aria-labelledby="filter-sheet-sort" onKeyDown={onGroupKeyDown} className="pb-2">
        <p id="filter-sheet-sort" className="px-5 pb-1 pt-2 text-[13px] font-medium text-slate-600">Sort</p>
        {sortOptions.map((option) => row({ key: option.key, label: option.label, checked: option.key === draftSort, onSelect: () => setDraftSort(option.key), role: "radio", tabbable: option.key === draftSort }))}
      </div>}
      {facets.map((facet) => {
        const selected = facetSelectedValues(facet, draft)
        const options = (facet.sections ? facet.sections.flatMap((section) => section.options) : facet.options ?? [])
        const multi = facet.kind === "multi"
        const allSelected = selected.length === 0
        const groupId = `filter-sheet-${facet.param}`
        return <div key={facet.param} role={multi ? "group" : "radiogroup"} aria-labelledby={groupId} onKeyDown={multi ? undefined : onGroupKeyDown} className="border-t border-slate-200 pb-2">
          <p id={groupId} className="px-5 pb-1 pt-3 text-[13px] font-medium text-slate-600">{facet.label}</p>
          {!multi && row({ key: "__all", label: facet.allLabel ?? "All", checked: allSelected, onSelect: () => setDraftFacet(facet, []), role: "radio", tabbable: allSelected })}
          {options.map((option) => {
            const checked = selected.includes(option.value)
            return row({ key: option.value, label: option.label, checked, onSelect: () => toggleFacetValue(facet, option.value), role: multi ? "checkbox" : "radio", tabbable: multi || checked })
          })}
        </div>
      })}
      {facets.length === 0 && sortOptions.length <= 1 && <p className="px-5 py-4 text-sm text-slate-600">Nothing to filter on this queue.</p>}
    </div>
    <div className="grid grid-cols-2 gap-3 border-t border-slate-200 px-5 py-3">
      <button type="button" onClick={clear} disabled={activeCount === 0}
        className="inline-flex h-12 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1">
        Clear
      </button>
      <button type="button" onClick={apply}
        className="inline-flex h-12 items-center justify-center rounded-md bg-emerald-700 text-sm font-semibold tabular-nums text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1">
        Show {count} {count === 1 ? "row" : "rows"}
      </button>
      {/* The count changes under the operator's fingers as facets are toggled; say so once per change
        * without moving focus off the radio. */}
      <p aria-live="polite" className="sr-only">{count} {count === 1 ? "row" : "rows"} match</p>
    </div>
  </Dialog>
}

/** The button that opens the sheet — "Filter", or "Filter · 2" when anything is active, tinted
 * so an applied filter is never invisible on a phone that hides the chips. */
export function FilterButton({ facets, sortParam, defaultSortKey, onClick }: {
  facets: Facet[]
  sortParam: string
  defaultSortKey: string | null
  onClick: () => void
}) {
  const searchParams = useSearchParams()
  const count = activeFilterCount(searchParams, facets, { param: sortParam, defaultKey: defaultSortKey })
  const active = count > 0
  return <button type="button" onClick={onClick} aria-haspopup="dialog"
    className={`inline-flex h-11 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${active ? "border-emerald-600 text-emerald-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
    <Filter className="h-4 w-4" aria-hidden />
    {active ? `Filter · ${count}` : "Filter"}
    {active && <span className="sr-only">{`, ${count} active`}</span>}
  </button>
}

"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type FacetOption = { value: string; label: string }

/** One summary chip in the queue header (#225, Vic's shape verified 2026-09-15): the chip reads
 * `Label · Selection`; clicking it opens a facet panel with the full option set — grouped into
 * sections where the taxonomy is hierarchical (Status → Open sub-states vs Closed sub-states) —
 * and Cancel / Apply. Nothing changes until Apply, so a chip is never eleven inline pills. A
 * `toggle` facet has one boolean option and flips on click without a panel. */
export type Facet = {
  /** The URL search param the facet reads and writes. */
  param: string
  label: string
  kind?: "single" | "multi" | "toggle"
  /** Flat option list, or `sections` for a hierarchical panel. */
  options?: FacetOption[]
  sections?: Array<{ label: string; options: FacetOption[] }>
  /** Chip text when nothing is selected. Defaults to "All". */
  allLabel?: string
}

function allOptions(facet: Facet): FacetOption[] {
  return facet.sections ? facet.sections.flatMap((section) => section.options) : facet.options ?? []
}

function selectedValues(facet: Facet, params: URLSearchParams): string[] {
  const raw = params.get(facet.param)
  if (!raw) return []
  const valid = new Set(allOptions(facet).map((option) => option.value))
  return raw.split(",").filter((value) => valid.has(value))
}

function summary(facet: Facet, values: string[]): string {
  if (values.length === 0) return facet.allLabel ?? "All"
  if (facet.kind === "multi" && values.length > 1) return `${values.length} selected`
  return allOptions(facet).find((option) => option.value === values[0])?.label ?? values[0]
}

export function FacetFilters({ facets }: { facets: Facet[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const apply = (param: string, values: string[]) => {
    const next = new URLSearchParams(searchParams.toString())
    if (values.length === 0) next.delete(param); else next.set(param, values.join(","))
    // Changing a filter leaves whichever saved view was selected — the picker shows the view as
    // dirty rather than silently rewriting it.
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const anyActive = facets.some((facet) => selectedValues(facet, searchParams).length > 0)

  return <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filters">
    {facets.map((facet) => {
      const values = selectedValues(facet, searchParams)
      if (facet.kind === "toggle") {
        const on = values.length > 0
        const option = allOptions(facet)[0]
        return <button key={facet.param} type="button" aria-pressed={on}
          onClick={() => apply(facet.param, on ? [] : [option.value])}
          className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${on ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
          {on && <Check className="h-3.5 w-3.5" aria-hidden />}
          {option.label}
        </button>
      }
      return <FacetChip key={facet.param} facet={facet} values={values} onApply={(next) => apply(facet.param, next)} />
    })}
    {anyActive && <button type="button" onClick={() => {
      const next = new URLSearchParams(searchParams.toString())
      for (const facet of facets) next.delete(facet.param)
      const qs = next.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    }} className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1">
      <X className="h-3.5 w-3.5" aria-hidden />Clear filters
    </button>}
  </div>
}

function FacetChip({ facet, values, onApply }: { facet: Facet; values: string[]; onApply: (values: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(values)
  const active = values.length > 0
  const multi = facet.kind === "multi"
  const sections = facet.sections ?? [{ label: "", options: facet.options ?? [] }]

  const toggleValue = (value: string) => setDraft((current) => {
    if (multi) return current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    return current[0] === value ? [] : [value]
  })

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setDraft(values) }}>
    <PopoverTrigger asChild>
      <button type="button"
        className={`inline-flex h-8 max-w-[14rem] items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${active ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
        <span className={active ? "text-emerald-800" : "text-slate-500"}>{facet.label}</span>
        <span aria-hidden className={active ? "text-emerald-700" : "text-slate-400"}>·</span>
        <span className="truncate">{summary(facet, values)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0" onOpenAutoFocus={(event) => {
      // Land on the first option rather than the Cancel button, so arrowing through the panel
      // starts where the choices are.
      event.preventDefault()
      const first = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-facet-option]")
      first?.focus()
    }}>
      <form onSubmit={(event) => { event.preventDefault(); onApply(draft); setOpen(false) }}>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-3 py-3">
          {sections.map((section) => <fieldset key={section.label || "options"} className="min-w-0">
            {section.label && <legend className="mb-1.5 text-xs font-semibold text-slate-700">{section.label}</legend>}
            <div className="flex flex-wrap gap-1.5">
              {section.options.map((option) => {
                const checked = draft.includes(option.value)
                return <label key={option.value} className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600 has-[:focus-visible]:ring-offset-1 ${checked ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  <input type={multi ? "checkbox" : "radio"} name={facet.param} value={option.value} checked={checked} data-facet-option
                    onChange={() => toggleValue(option.value)} onClick={() => { if (!multi && checked) setDraft([]) }}
                    className="sr-only" />
                  {checked && <Check className="h-3.5 w-3.5" aria-hidden />}
                  {option.label}
                </label>
              })}
            </div>
          </fieldset>)}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2">
          <button type="button" onClick={() => setDraft([])} disabled={draft.length === 0} className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40">Clear</button>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" className="inline-flex h-8 items-center rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800">Apply</button>
          </div>
        </div>
      </form>
    </PopoverContent>
  </Popover>
}

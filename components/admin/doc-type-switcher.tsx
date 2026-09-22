"use client"

import Link from "next/link"
import { useRef, type KeyboardEvent } from "react"

/** #231 Q22 (#252): the document-type switcher above the field table — Invoice · Purchase Order
 * · Receipt · Bank Statement. Links, so each type deep-links (`?type=`), arranged as a tablist
 * with ←/→ Home/End so it reads as one control. */
export function DocTypeSwitcher({ basePath, current, types, panelId }: {
  basePath: string
  current: string
  types: { value: string; label: string; shortLabel?: string }[]
  panelId: string
}) {
  const refs = useRef<(HTMLAnchorElement | null)[]>([])
  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    const last = types.length - 1
    const target = event.key === "ArrowRight" ? Math.min(last, index + 1)
      : event.key === "ArrowLeft" ? Math.max(0, index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null
    if (target === null) return
    event.preventDefault()
    refs.current[target]?.focus()
  }
  return <div role="tablist" aria-label="Document type" className="inline-flex max-w-full overflow-x-auto rounded-md border border-hairline bg-slate-50 p-1">
    {types.map((type, index) => {
      const selected = type.value === current
      return <Link key={type.value} href={`${basePath}?type=${type.value}`} role="tab" aria-selected={selected} aria-controls={panelId} aria-label={type.label}
        tabIndex={selected ? 0 : -1} ref={(element) => { refs.current[index] = element }} onKeyDown={(event) => onKeyDown(event, index)}
        className={`h-8 shrink-0 whitespace-nowrap rounded px-3 text-[13px] font-medium leading-8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${selected ? "bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-700/10" : "text-slate-600 hover:text-slate-900"}`}>
        <span className="md:hidden">{type.shortLabel ?? type.label}</span><span className="hidden md:inline">{type.label}</span>
      </Link>
    })}
  </div>
}

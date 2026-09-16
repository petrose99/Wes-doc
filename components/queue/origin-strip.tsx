import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Origin } from "@/lib/navigation/origin"

/** #268 spec §2: the one way back to a cross-surface hop's origin. Renders `null` when there is
 * none — no placeholder, no layout shift (spec §5.2). One `<a>`, one line, never emerald (it is a
 * way back, not a call to action). */
export function OriginStrip({ origin }: { origin: Origin | null | undefined }) {
  if (!origin) return null
  const text = originText(origin)
  return <Link href={origin.href} aria-label={text.join(", ")}
    className="flex h-auto min-h-11 w-full items-center gap-1.5 whitespace-nowrap border-b border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 md:h-8 md:min-h-0">
    <ArrowLeft className="size-4 shrink-0" aria-hidden />
    <span className="font-medium shrink-0">Back to {origin.label}</span>
    {origin.row && <>
      <span aria-hidden="true" className="shrink-0 text-slate-500">·</span>
      <span className="min-w-0 flex-1 truncate text-slate-500" title={origin.row.title}>{origin.row.title}</span>
      {origin.row.suffix && <>
        <span aria-hidden="true" className="shrink-0 text-slate-500">·</span>
        <span className="shrink-0 tabular-nums text-slate-500">{origin.row.suffix}</span>
      </>}
    </>}
    {origin.search && <>
      {origin.search.q && <>
        <span aria-hidden="true" className="shrink-0 text-slate-500">·</span>
        <span className="min-w-0 flex-1 truncate text-slate-500">&quot;{origin.search.q}&quot;</span>
      </>}
      {origin.search.filterCount > 0 && <>
        <span aria-hidden="true" className="shrink-0 text-slate-500">·</span>
        <span className="shrink-0 text-slate-500">{origin.search.filterCount} filter{origin.search.filterCount === 1 ? "" : "s"}</span>
      </>}
    </>}
  </Link>
}

/** The visible text, comma-joined, as the accessible name (#268 spec §2.1: the #257 composite-
 * name lesson — no `sr-only` spans, no separate name from the rendered text). */
function originText(origin: Origin): string[] {
  const parts = [`Back to ${origin.label}`]
  if (origin.row) {
    parts.push(origin.row.title)
    if (origin.row.suffix) parts.push(origin.row.suffix)
  }
  if (origin.search) {
    if (origin.search.q) parts.push(`"${origin.search.q}"`)
    if (origin.search.filterCount > 0) parts.push(`${origin.search.filterCount} filter${origin.search.filterCount === 1 ? "" : "s"}`)
  }
  return parts
}

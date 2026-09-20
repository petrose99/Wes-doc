/** #236 decision #10 / #261 spec §4: the one loading state every queue route renders — a header
 * bar skeleton and 8 row skeletons at the list's own row height (62px table rows at `md`+, 64px
 * cards below), shown while the App Router suspends the segment for a filter, sort or segment
 * navigation. `aria-busy` names the region for assistive tech; no spinner, no layout shift. */
/** #270 spec §3 "Slow": the row-only half of the skeleton below, reused by Search while a request
 * is open ≥ 300ms (in place of the rows, header/facets stay put — Search never suspends the whole
 * segment the way a route navigation does). */
export function QueueRowSkeleton({ label }: { label: string }) {
  return <div className="divide-y divide-slate-100" aria-busy="true" aria-label={label}>
    {Array.from({ length: 8 }).map((_, index) => <div key={index} className="flex h-16 items-center gap-3 px-4 md:h-[62px]">
      <div className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-slate-200" style={{ animationDelay: `${index * 40}ms` }} />
      <div className="h-3.5 max-w-xs flex-1 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${index * 40}ms` }} />
      <div className="h-3.5 w-20 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${index * 40}ms` }} />
      <div className="h-3.5 w-24 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${index * 40}ms` }} />
    </div>)}
  </div>
}

export function QueueLoading({ title }: { title: string }) {
  return <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label={`Loading ${title}`}>
    <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2">
      <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
      <div className="h-7 w-40 animate-pulse rounded-md bg-slate-100" />
    </div>
    <QueueRowSkeleton label={`Loading ${title}`} />
  </div>
}

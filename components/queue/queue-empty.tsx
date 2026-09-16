import type { ReactNode } from "react"
import type { EmptyQueueState } from "@/lib/queue/empty-state"

/** #264 spec §4/§3: the queue's empty-list area, lifted out of `queue-screen.tsx` so the three
 * states (first-use, done, filtered) share one renderer instead of three copies of the column. */
export type QueueEmptyProps = {
  state: EmptyQueueState
  firstUse?: { title: string; body: string; action?: ReactNode; phoneAction?: ReactNode }
  done?: { title?: string; body?: string; action?: ReactNode }
  filteredTitle?: string
  filteredBody?: string
  filteredAction?: ReactNode
  hiddenByFilters: number
  onClearFilters: () => void
}

export function QueueEmpty({ state, firstUse, done, filteredTitle, filteredBody, filteredAction, hiddenByFilters, onClearFilters }: QueueEmptyProps) {
  if (state === "first-use" && firstUse) {
    return <section aria-labelledby="queue-empty-title" className="mx-auto max-w-md px-6 py-16 text-center max-md:py-12">
      <h2 id="queue-empty-title" tabIndex={-1} className="text-sm font-semibold text-slate-900 focus:outline-none">{firstUse.title}</h2>
      <p className="mx-auto mt-2 max-w-prose text-sm text-slate-600">{firstUse.body}</p>
      {(firstUse.action || firstUse.phoneAction) && <div className="mt-5 flex flex-col items-center gap-3">
        {firstUse.action && <div className="max-md:hidden">{firstUse.action}</div>}
        <div className="md:hidden">{firstUse.phoneAction ?? firstUse.action}</div>
      </div>}
    </section>
  }
  if (state === "filtered") {
    return <section aria-labelledby="queue-empty-title" className="mx-auto max-w-md px-6 py-16 text-center max-md:py-12">
      <h2 id="queue-empty-title" tabIndex={-1} className="text-sm font-medium text-slate-800 focus:outline-none">{filteredTitle ?? "Nothing matches these filters."}</h2>
      <p className="mt-1 text-sm text-slate-600">{filteredBody ?? (hiddenByFilters > 0 ? `${hiddenByFilters} ${hiddenByFilters === 1 ? "row is" : "rows are"} hidden by the filters.` : "Clear a filter to widen the queue.")}</p>
      <div className="mt-3 text-sm">{filteredAction ?? <button type="button" onClick={onClearFilters}
        className="inline-flex h-11 items-center rounded-md border border-slate-300 bg-white px-4 py-2 font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 md:h-8 md:px-3 md:py-1 md:text-xs">Clear filters</button>}</div>
    </section>
  }
  return <section aria-labelledby="queue-empty-title" className="mx-auto max-w-md px-6 py-16 text-center max-md:py-12">
    <h2 id="queue-empty-title" tabIndex={-1} className="text-sm font-medium text-slate-800 focus:outline-none">{done?.title ?? "Nothing needs you."}</h2>
    <p className="mt-1 text-sm text-slate-600">{done?.body ?? "Nothing in this view needs you."}</p>
    {done?.action && <div className="mt-3 text-sm">{done.action}</div>}
  </section>
}

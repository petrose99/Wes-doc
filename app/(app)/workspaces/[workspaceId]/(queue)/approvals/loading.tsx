/** #236 decision #10's loading state: 62px row skeletons, matching `QueueScreen`'s own row
 * height exactly, shown while switching between Invoices/PO Mismatches or changing a filter —
 * both are query-param navigations the App Router suspends this segment for. */
export default function ApprovalsLoading() {
  return <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading Approvals">
    <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2">
      <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
      <div className="h-7 w-40 animate-pulse rounded-md bg-slate-100" />
    </div>
    <div className="divide-y divide-slate-100">
      {Array.from({ length: 8 }).map((_, index) => <div key={index} style={{ height: 62 }} className="flex items-center gap-3 px-4">
        <div className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-slate-200" style={{ animationDelay: `${index * 40}ms` }} />
        <div className="h-3.5 flex-1 max-w-xs animate-pulse rounded bg-slate-100" style={{ animationDelay: `${index * 40}ms` }} />
        <div className="h-3.5 w-20 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${index * 40}ms` }} />
        <div className="h-3.5 w-24 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${index * 40}ms` }} />
      </div>)}
    </div>
  </div>
}

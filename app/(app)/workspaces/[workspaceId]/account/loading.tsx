/** #252 (evaluate H1): every Account page is force-dynamic, so a nav click showed the old page
 * unchanged until the server answered. This is the page frame with the title and first panel
 * greyed in — the same 880px column, so nothing jumps when the content lands. */
export default function AccountLoading() {
  return <div className="w-full max-w-[880px] px-5 py-6 md:px-8 md:py-8" aria-busy="true" aria-live="polite">
    <p className="sr-only">Loading…</p>
    <div className="mb-8 space-y-3" aria-hidden>
      <div className="h-[26px] w-40 rounded bg-slate-100" />
      <div className="h-3.5 w-[52ch] max-w-full rounded bg-slate-100" />
    </div>
    <div className="space-y-10" aria-hidden>
      {[0, 1].map((i) => <div key={i}>
        <div className="border-b border-hairline pb-2.5"><div className="h-4 w-36 rounded bg-slate-100" /></div>
        <div className="space-y-2.5 pt-4">
          <div className="h-3.5 w-3/4 rounded bg-slate-100" />
          <div className="h-3.5 w-2/3 rounded bg-slate-100" />
          <div className="h-3.5 w-1/2 rounded bg-slate-100" />
        </div>
      </div>)}
    </div>
  </div>
}

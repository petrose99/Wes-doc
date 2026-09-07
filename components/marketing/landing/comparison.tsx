const MOMENTS = [
  {
    moment: "200 mixed files land on you at quarter-end",
    byHand: "Sort by type yourself, eyeball for duplicates, and hope nothing's missing until reconciliation says otherwise.",
    withDocuBite: "Grouped by type and supplier, duplicates paired, missing periods named — before you open a single file.",
  },
  {
    moment: "An error is sitting in the data",
    byHand: "You meet it at month-end, in a reconciliation that won't balance, weeks after it was typed.",
    withDocuBite: "Checks catch it in review — line items that don't sum, a missing VAT number — while it's still one document, not a journal.",
  },
  {
    moment: "Someone asks where a number came from",
    byHand: "Find the file, find the page, read the invoice, explain the arithmetic. Repeat per question.",
    withDocuBite: "Click the value. The source opens at the right page, highlighted at the line it was read from, with an audit record of who touched it.",
  },
]

export function Comparison() {
  return (
    <section className="bg-cream-50 py-16 md:py-30">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="text-balance font-display text-[clamp(2.2rem,3.8vw,3.4rem)] font-extrabold leading-[1.06] tracking-[-0.035em] text-stone-900">
          The same three moments, done two ways
        </h2>
        <p className="mt-4.5 max-w-[40rem] text-pretty text-[1.12rem] leading-[1.6] text-stone-600">
          Where the work actually gets hard — and where an afternoon turns into a click.
        </p>
        <div className="mt-10 md:mt-13 flex flex-col gap-4 md:gap-5.5">
          {MOMENTS.map((row) => (
            <div key={row.moment} className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 md:gap-5.5">
              <div className="rounded-2xl border border-cream-200 bg-white p-5 md:p-7">
                <span className="text-[0.68rem] font-bold uppercase tracking-[.07em] text-stone-500">The moment</span>
                <p className="mt-3 text-[1.28rem] font-bold leading-[1.3] tracking-[-0.01em] text-stone-900">{row.moment}</p>
              </div>
              <div className="rounded-2xl border border-cream-200 bg-white p-5 md:p-7">
                <span className="text-[0.68rem] font-bold uppercase tracking-[.07em] text-red-700">By hand</span>
                <p className="mt-3.5 text-pretty text-[1.04rem] leading-[1.62] text-stone-600">{row.byHand}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 md:p-7 shadow-[0_1px_2px_rgba(6,78,59,.05),0_6px_20px_rgba(6,78,59,.06)]">
                <span className="text-[0.68rem] font-bold uppercase tracking-[.07em] text-emerald-700">With DocuBite</span>
                <p className="mt-3.5 text-pretty text-[1.04rem] leading-[1.62] text-emerald-800">{row.withDocuBite}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

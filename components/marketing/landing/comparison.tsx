"use client"

import { IN, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"

/** The before/after fork.
 *
 * It used to be nine cards — three rows of three, each row restating the same three labels, so the
 * page's most rhetorical moment read as its most monotonous. The content is one comparison, so it
 * is now one object: a table whose two column headings are said once, with each moment as a row
 * read straight across.
 *
 * The emerald runs as a single unbroken column down the right rather than as three separate green
 * boxes, and that continuity is the argument — one side of the page stays lit the whole way down,
 * while the left greys out. Row rules inside that column are emerald-tinted so they divide without
 * cutting it. The reveal walks the column top to bottom on scroll; it is the only motion here. */

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

const COLS = "md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1.05fr)]"

export function Comparison() {
  const { ref, played } = usePlayOnScroll(0.15)

  return (
    <section ref={ref} className="bg-cream-50 py-16 md:py-30">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="text-balance font-display text-[clamp(2.2rem,3.8vw,3.4rem)] font-extrabold leading-[1.06] tracking-[-0.035em] text-stone-900">
          The same three moments, done two ways
        </h2>
        <p className="mt-4.5 max-w-[40rem] text-pretty text-[1.12rem] leading-[1.6] text-stone-600">
          Where the work actually gets hard — and where an afternoon turns into a click.
        </p>

        <div className="mt-10 overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_20px_48px_rgba(28,25,23,.08)] md:mt-13">
          {/* Column headings, said once. Hidden where the table stacks — each answer carries its
              own label there instead, so a phone reader is never guessing which side they are on. */}
          <div className={`hidden md:grid ${COLS}`}>
            <div aria-hidden />
            <div className="px-6 pb-3 pt-6">
              <span className="text-[0.68rem] font-bold uppercase tracking-[.07em] text-stone-400">By hand</span>
            </div>
            <div className="bg-emerald-50 px-7 pb-3 pt-6">
              <span className="text-[0.68rem] font-bold uppercase tracking-[.07em] text-emerald-700">With DocuBite</span>
            </div>
          </div>

          {MOMENTS.map((row, i) => (
            <div key={row.moment} className={`grid ${COLS}`}>
              <div className="border-t border-cream-200 px-6 pb-5 pt-6 md:pl-7">
                <p className="text-pretty font-display text-[1.2rem] font-bold leading-[1.32] tracking-[-0.015em] text-stone-900 md:text-[1.26rem]">
                  {row.moment}
                </p>
              </div>

              <div className="border-t border-cream-200 px-6 pb-6 md:pt-6">
                <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-[.07em] text-stone-400 md:hidden">By hand</span>
                <p className="text-pretty text-[1.01rem] leading-[1.62] text-stone-500">{row.byHand}</p>
              </div>

              <div
                className={`border-t border-emerald-100 bg-emerald-50 px-6 pb-6 pt-5 md:px-7 md:pt-6 ${played ? IN : ""}`}
                style={played ? { animationDelay: `${0.12 + i * 0.16}s` } : undefined}
              >
                <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-[.07em] text-emerald-700 md:hidden">With DocuBite</span>
                <p className="text-pretty text-[1.01rem] leading-[1.62] text-emerald-900">{row.withDocuBite}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

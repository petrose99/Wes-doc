"use client"

import { ReplayButton } from "@/components/marketing/landing/_lib/replay-button"
import { IN, POP, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"
import { Check, FileText, Sparkles } from "lucide-react"

const ROWS = [
  { n: 1, doc: "INV-4471.pdf", supplier: "Northwind Trading", total: "£2,475.60", delay: 0.15 },
  { n: 2, doc: "scan_0043.jpg", supplier: "Bell & Sons Hardware", total: "£86.40", delay: 0.4 },
  { n: 3, doc: "receipt-cafe.heic", supplier: "Provisions Co.", total: "£19.20", delay: 0.65 },
  { n: 4, doc: "EDF-energy.pdf", supplier: "EDF Energy", total: "£318.09", delay: 0.9 },
]

export function Sheets() {
  const { ref, played, replay } = usePlayOnScroll()

  return (
    <section id="sheets" ref={ref} className="bg-cream-50 py-14 md:py-22">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-8 md:gap-13 px-5">
        <div className="min-w-0 flex-1 basis-[340px]">
          <span className="text-[0.74rem] font-bold uppercase tracking-[.08em] text-emerald-700">Sheets</span>
          <h2 className="mt-3 text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-stone-900">
            A spreadsheet built in, for the analysis afterwards
          </h2>
          <p className="mt-4 max-w-[31rem] text-pretty text-[1.02rem] leading-[1.62] text-stone-600">
            Open a Sheet whenever you want to work with numbers. Pull in your reviewed extractions, run a report out of the built-in ledger, drop in a financial statement from QuickBooks or Xero, or upload any Excel or CSV — then sort, add columns, and ask the built-in AI Assistant to write a formula or answer a question about the rows. Download the tab as CSV or the whole book as Excel when you&apos;re done.
          </p>
          <ReplayButton onClick={replay} />
        </div>

        <div className="min-w-0 flex-1 basis-[440px]">
          <div className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_14px_36px_rgba(28,25,23,.07)]">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 px-3.5 py-2.5">
              <span className="text-[0.76rem] font-semibold text-slate-700">March close.xlsx</span>
              <span className="ml-auto inline-flex h-[26px] items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[0.7rem] font-semibold text-slate-600">
                <FileText aria-hidden className="h-3 w-3 text-slate-500" />Export Excel
              </span>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[0.7rem] font-bold text-emerald-700">
                <Sparkles aria-hidden className="h-3 w-3 text-emerald-700" />AI Assistant
              </span>
            </div>
            <div className="flex gap-3.5 border-b border-slate-100 px-3.5 py-1.5 text-[0.72rem] text-slate-500">
              <span className="font-semibold text-emerald-700">Start</span>
              <span>Formulas</span>
              <span>Data</span>
            </div>
            <div className="grid grid-cols-[30px_minmax(0,1.4fr)_minmax(0,1fr)_92px] text-[0.73rem]">
              <div className="col-span-full grid grid-cols-subgrid border-b border-slate-100 bg-slate-50 text-[0.62rem] font-bold uppercase tracking-wide text-slate-400">
                <span className="border-r border-slate-100 px-1.5 py-1.5 text-center" />
                <span className="border-r border-slate-100 px-2.5 py-1.5">Document</span>
                <span className="border-r border-slate-100 px-2.5 py-1.5">Supplier</span>
                <span className="px-2.5 py-1.5 text-right">Total</span>
              </div>
              {ROWS.map((row) => (
                <div key={row.n} className={`col-span-full grid grid-cols-subgrid border-b border-slate-50 text-slate-900 ${played ? IN : ""}`} style={played ? { animationDelay: `${row.delay}s` } : undefined}>
                  <span className="border-r border-slate-50 px-1.5 py-2 text-center text-slate-300">{row.n}</span>
                  <span className="truncate border-r border-slate-50 px-2.5 py-2 text-slate-700">{row.doc}</span>
                  <span className="truncate border-r border-slate-50 px-2.5 py-2 text-slate-700">{row.supplier}</span>
                  <span className="px-2.5 py-2 text-right font-semibold underline decoration-emerald-200 underline-offset-[3px]">{row.total}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-3.5 py-2.5 text-[0.72rem] text-slate-500">
              <span className={played ? IN : ""} style={played ? { animationDelay: "1.1s" } : undefined}>Cell traces to INV-4471.pdf · page 1</span>
              <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-800 ${played ? POP : ""}`} style={played ? { animationDelay: "1.4s" } : undefined}>
                <Check aria-hidden className="h-3 w-3 text-emerald-700" strokeWidth={2.4} />42 rows exported to Excel
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

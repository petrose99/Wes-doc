"use client"

import { IN, POP, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"
import { Check, FileText, MoveUpRight } from "lucide-react"

const ROWS = [
  { supplier: "Northwind Trading", doc: "INV-4471.pdf", category: "Cost of goods", amount: "£2,475.60", rowDelay: 0.15, pushDelay: 1 },
  { supplier: "Bell & Sons Hardware", doc: "scan_0043.jpg", category: "Repairs", amount: "£86.40", rowDelay: 0.4, pushDelay: 1.35 },
  { supplier: "EDF Energy", doc: "EDF-energy.pdf", category: "Utilities", amount: "£318.09", rowDelay: 0.65, pushDelay: 1.7 },
]

export function Accounting() {
  const { ref, played } = usePlayOnScroll()

  return (
    <section id="accounting" ref={ref} className="border-y border-cream-200 bg-white py-14 md:py-22">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-8 md:gap-13 px-5">
        <div className="order-2 min-w-0 flex-1 basis-[440px] md:order-1">
          <div className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_14px_36px_rgba(28,25,23,.07)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3.5">
              <FileText aria-hidden className="h-4 w-4 text-slate-400" />
              <span className="font-display text-[0.98rem] font-bold text-slate-900">Ready to push</span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-100 px-1.5 text-[0.7rem] font-bold text-emerald-700">3</span>
              <span className="ml-auto inline-flex h-[30px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[0.74rem] font-semibold text-white">
                <MoveUpRight aria-hidden className="h-3 w-3" strokeWidth={2.2} />Push all
              </span>
            </div>
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,.9fr)_84px_96px] border-b border-slate-100 bg-slate-50 px-4 py-2 text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">
              <span>Supplier</span><span>Category</span><span className="text-right">Amount</span><span className="text-right">Status</span>
            </div>
            <div className="flex flex-col">
              {ROWS.map((row, i) => (
                <div key={row.doc} className={`grid grid-cols-[minmax(0,1.3fr)_minmax(0,.9fr)_84px_96px] items-center gap-1.5 px-4 py-2.5 ${i < ROWS.length - 1 ? "border-b border-slate-50" : ""} ${played ? IN : ""}`} style={played ? { animationDelay: `${row.rowDelay}s` } : undefined}>
                  <div className="min-w-0">
                    <p className="truncate text-[0.8rem] font-semibold text-slate-900">{row.supplier}</p>
                    <p className="truncate text-[0.68rem] text-slate-400">{row.doc}</p>
                  </div>
                  <span><span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-semibold text-slate-600">{row.category}</span></span>
                  <span className="text-right text-[0.79rem] font-bold text-slate-900">{row.amount}</span>
                  <span className="text-right">
                    <span className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.66rem] font-bold text-emerald-700 ${played ? POP : ""}`} style={played ? { animationDelay: `${row.pushDelay}s` } : undefined}>
                      <Check aria-hidden className="h-2.5 w-2.5 text-emerald-700" strokeWidth={2.6} />Pushed
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[0.72rem] text-slate-500">
              Posted as bills in your ledger — or forwarded to
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700">QuickBooks</span>
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700">Xero</span>
            </div>
          </div>
        </div>

        <div className="order-1 min-w-0 flex-1 basis-[340px] md:order-2">
          <span className="text-[0.74rem] font-bold uppercase tracking-[.08em] text-emerald-700">Accounting</span>
          <h2 className="mt-3 text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-stone-900">
            A full ledger, without leaving the app
          </h2>
          <p className="mt-4 max-w-[31rem] text-pretty text-[1.02rem] leading-[1.62] text-stone-600">
            A full double-entry accounting module is built in — chart of accounts, journals, AP/AR, VAT, financial statements. Reviewed invoices and receipts post as bills against the right expense account in one click. Prefer to keep the books elsewhere? Forward the same batch to QuickBooks or Xero instead — DocuBite&apos;s duplicate guard travels with it.
          </p>
        </div>
      </div>
    </section>
  )
}

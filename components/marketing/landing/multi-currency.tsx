"use client"

import { IN, POP, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"
import { MOCK_TYPE } from "@/components/marketing/landing/_lib/mock-scale"
import { ArrowRight, Globe2 } from "lucide-react"

/** Three worked examples showing an extracted foreign-currency total on the left, the workspace's
 * base-currency equivalent on the right, and the rate DocuBite booked it at. Chosen to span
 * different rate magnitudes (EUR/USD near parity, JPY/USD tiny, LSL/ZAR pegged 1:1) so it's
 * visually obvious that the conversion is real, not a display trick. */
const ROWS = [
  { supplier: "Berlin Werkzeug GmbH", doc: "INV-2411.pdf",  from: "€2,140.00",  to: "$2,489.10",  rate: "1.0884",  date: "2026-03-12", source: "ECB reference",       rowDelay: 0.15, popDelay: 1.0 },
  { supplier: "Tokyo Office Supply",  doc: "receipt_88.jpg", from: "¥14,850",    to: "$99.10",     rate: "0.00668", date: "2026-03-12", source: "live intraday",        rowDelay: 0.4,  popDelay: 1.35 },
  { supplier: "Maseru Print Works",   doc: "M-INV-013.pdf",  from: "M 1,850.00", to: "R 1,850.00", rate: "1.0000",  date: "2026-03-12", source: "ZAR peg (CMA)",     rowDelay: 0.65, popDelay: 1.7 },
]

export function MultiCurrency() {
  const { ref, played } = usePlayOnScroll()

  return (
    <section id="multi-currency" ref={ref} className="border-y border-slate-200 bg-white py-14 md:py-22">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-8 md:gap-13 px-5">
        <div className="min-w-0 flex-1 basis-[340px]">
          <h2 className="text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-slate-900">
            One workspace, every currency
          </h2>
          <p className="mt-4 max-w-[31rem] text-pretty text-[1.02rem] leading-[1.62] text-slate-600">
            Extract an invoice in any currency. DocuBite reads it in the original, then converts to your workspace&apos;s base at the rate that applied on the invoice&apos;s own date, not today&apos;s. The document library shows both; totals, dashboards and any push to QuickBooks or Xero use the converted amount. Rates come from live and historical ECB reference feeds, historical back to 1999.
          </p>
          <ul className="mt-5 space-y-2.5 text-[0.94rem] text-slate-600">
            <li className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />Historical rates are frozen on the document. A 2024 invoice booked in 2026 keeps 2024&apos;s rate.</li>
            <li className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />CMA pegs handled natively: Lesotho&apos;s Loti, Namibia&apos;s Dollar and Eswatini&apos;s Lilangeni track the Rand 1:1.</li>
            <li className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />A rate that hasn&apos;t landed yet blocks the ledger push rather than booking a wrong number.</li>
          </ul>
        </div>

        <div className="min-w-0 flex-1 basis-[460px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_14px_36px_rgba(28,25,23,.07)]">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3.5">
              <Globe2 aria-hidden className="h-4 w-4 text-slate-600" />
              <span className={`font-display font-bold text-slate-900 ${MOCK_TYPE.evidence}`}>Foreign-currency inbox</span>
              <span className={`ml-auto font-semibold text-slate-600 ${MOCK_TYPE.supporting}`}>Base currency · USD</span>
            </div>
            <div className={`grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-100 bg-slate-50 px-4 py-2 ${MOCK_TYPE.label} text-slate-600`}>
              <span>Supplier</span><span>Original</span><span className="text-right">Converted</span>
            </div>
            <div className="flex flex-col">
              {ROWS.map((row, i) => (
                <div key={row.doc} className={`grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5 px-4 py-3 ${i < ROWS.length - 1 ? "border-b border-slate-50" : ""} ${played ? IN : ""}`} style={played ? { animationDelay: `${row.rowDelay}s` } : undefined}>
                  <div className="min-w-0">
                    <p className={`break-words font-semibold text-slate-900 ${MOCK_TYPE.evidence}`}>{row.supplier}</p>
                    <p className={`break-words text-slate-600 ${MOCK_TYPE.supporting}`}>{row.doc}</p>
                  </div>
                  <span className={`font-bold text-slate-900 ${MOCK_TYPE.evidence}`}>{row.from}</span>
                  <span className="text-right">
                    <span className={`inline-flex items-center gap-1.5 ${played ? POP : ""}`} style={played ? { animationDelay: `${row.popDelay}s` } : undefined}>
                      <ArrowRight aria-hidden className="h-3 w-3 text-slate-300" />
                      <span className={`font-bold text-emerald-700 ${MOCK_TYPE.evidence}`}>{row.to}</span>
                    </span>
                    <p className={`mt-0.5 text-slate-600 ${MOCK_TYPE.supporting}`}>rate {row.rate} · {row.source}</p>
                  </span>
                </div>
              ))}
            </div>
            <div className={`border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-slate-600 ${MOCK_TYPE.supporting}`}>
              Rates are anchored to each document&apos;s own date and frozen on the row, so dashboards and ledger pushes always agree on the number.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

"use client"

import { IN, POP, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"
import { MOCK_TYPE } from "@/components/marketing/landing/_lib/mock-scale"
import { Check, FileText, Landmark, MoveUpRight } from "lucide-react"

const ROWS = [
  { supplier: "Northwind Trading", doc: "INV-4471.pdf", category: "Cost of goods", amount: "£2,475.60", rowDelay: 0.15, pushDelay: 1 },
  { supplier: "Bell & Sons Hardware", doc: "scan_0043.jpg", category: "Repairs", amount: "£86.40", rowDelay: 0.4, pushDelay: 1.35 },
  { supplier: "EDF Energy", doc: "EDF-energy.pdf", category: "Utilities", amount: "£318.09", rowDelay: 0.7, pushDelay: 1.7 },
]

/** The Finance destination row — the visual proof of the landing's core wedge. Every other tool
 * in the category is either a feeder (needs a ledger you already run) OR a suite (replaces
 * everything). DocuBite is the only one that is both, and this section is the one place on the
 * page where that claim becomes a picture. Four destinations, one selected — the visitor sees
 * their own answer. QuickBooks and Xero are shipping today; Sage and NetSuite are the roadmap
 * ("more connectors coming"), stated honestly rather than dressed up. */
const DESTINATIONS: { name: string; sub: string; state: "live" | "roadmap" | "builtin" }[] = [
  { name: "Built-in ledger", sub: "Included", state: "builtin" },
  { name: "QuickBooks", sub: "Online", state: "live" },
  { name: "Xero", sub: "Cash & accrual", state: "live" },
  { name: "Sage · NetSuite · more", sub: "Roadmap", state: "roadmap" },
]

export function Accounting() {
  const { ref, played } = usePlayOnScroll()

  return (
    <section id="finance" ref={ref} className="border-y border-slate-200 bg-white py-14 md:py-22">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 md:gap-14">
        <div className="flex flex-wrap items-center gap-8 md:gap-13">
          <div className="order-2 min-w-0 flex-1 basis-[440px] md:order-1">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_14px_36px_rgba(28,25,23,.07)]">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3.5">
                <FileText aria-hidden className="h-4 w-4 text-slate-600" />
                <span className={`font-display font-bold text-slate-900 ${MOCK_TYPE.evidence}`}>Ready to push</span>
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-100 px-1.5 font-bold text-emerald-700 ${MOCK_TYPE.supporting}`}>3</span>
                <span className={`ml-auto inline-flex h-[30px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 font-semibold text-white ${MOCK_TYPE.supporting}`}>
                  <MoveUpRight aria-hidden className="h-3 w-3" strokeWidth={2.2} />Push all
                </span>
              </div>
              <div className={`grid grid-cols-2 border-b border-slate-100 bg-slate-50 px-4 py-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,.9fr)_auto_auto] ${MOCK_TYPE.label} text-slate-600`}>
                <span>Supplier</span><span>Category</span><span className="text-right">Amount</span><span className="text-right">Status</span>
              </div>
              <div className="flex flex-col">
                {ROWS.map((row, i) => (
                  <div key={row.doc} className={`grid grid-cols-2 items-center gap-1.5 px-4 py-2.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,.9fr)_auto_auto] ${i < ROWS.length - 1 ? "border-b border-slate-50" : ""} ${played ? IN : ""}`} style={played ? { animationDelay: `${row.rowDelay}s` } : undefined}>
                    <div className="min-w-0">
                      <p className={`break-words font-semibold text-slate-900 ${MOCK_TYPE.evidence}`}>{row.supplier}</p>
                      <p className={`break-words text-slate-600 ${MOCK_TYPE.supporting}`}>{row.doc}</p>
                    </div>
                    <span><span className={`inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 ${MOCK_TYPE.supporting}`}>{row.category}</span></span>
                    <span className={`text-right font-bold text-slate-900 ${MOCK_TYPE.evidence}`}>{row.amount}</span>
                    <span className="text-right">
                      <span className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 ${MOCK_TYPE.supporting} ${played ? POP : ""}`} style={played ? { animationDelay: `${row.pushDelay}s` } : undefined}>
                        <Check aria-hidden className="h-2.5 w-2.5 text-emerald-700" strokeWidth={2.6} />Pushed
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <div className={`flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-slate-600 ${MOCK_TYPE.supporting}`}>
                <Landmark aria-hidden className="h-3.5 w-3.5 text-slate-600" />
                Posted as bills, coded to the right expense account. Duplicate guard travels with the push.
              </div>
            </div>
          </div>

          <div className="order-1 min-w-0 flex-1 basis-[340px] md:order-2">
            <h2 className="text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-slate-900">
              Post to your ledger. Or ours.
            </h2>
            <p className="mt-4 max-w-[31rem] text-pretty text-[1.02rem] leading-[1.62] text-slate-600">
              Reviewed bills post as accounting bills against the right expense account, into <strong className="font-semibold text-slate-800">QuickBooks Online</strong>, <strong className="font-semibold text-slate-800">Xero</strong>, your ERP as we add it, or the full double-entry ledger built into DocuBite: chart of accounts, journals, AP/AR, VAT, financial statements. Every push carries the same duplicate guard and the same audit trail; every bill traces one click back to the source PDF. No second tool to buy just because you use QuickBooks; no second tool to buy just because you don&apos;t.
            </p>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[0.72rem] font-bold uppercase tracking-[.08em] text-slate-500">Post to</span>
            <span className="text-[0.72rem] text-slate-600">Pick one per workspace; switch any time.</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DESTINATIONS.map((dest) => {
              const isBuiltin = dest.state === "builtin"
              const isRoadmap = dest.state === "roadmap"
              return (
                <div
                  key={dest.name}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 ${
                    isBuiltin
                      ? "border-emerald-300 bg-emerald-50/70 shadow-[0_1px_2px_rgba(4,120,87,.08),0_8px_20px_rgba(4,120,87,.10)]"
                      : isRoadmap
                        ? "border-dashed border-slate-300 bg-white/60"
                        : "border-slate-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.03),0_6px_18px_rgba(28,25,23,.05)]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`break-words font-bold ${MOCK_TYPE.evidence} ${isBuiltin ? "text-emerald-900" : isRoadmap ? "text-slate-600" : "text-slate-900"}`}>
                      {dest.name}
                    </p>
                    <p className={`mt-0.5 break-words font-medium ${MOCK_TYPE.supporting} ${isBuiltin ? "text-emerald-700" : "text-slate-600"}`}>
                      {dest.sub}
                    </p>
                  </div>
                  {isBuiltin
                    ? <Check aria-hidden className="h-4 w-4 shrink-0 text-emerald-700" strokeWidth={2.6} />
                    : isRoadmap
                      ? <span aria-hidden className={`font-semibold text-slate-600 ${MOCK_TYPE.supporting}`}>soon</span>
                      : <MoveUpRight aria-hidden className="h-4 w-4 shrink-0 text-slate-600" strokeWidth={2} />}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

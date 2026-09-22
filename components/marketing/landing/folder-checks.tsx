"use client"

import { IN, POP, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"
import { MOCK_TYPE } from "@/components/marketing/landing/_lib/mock-scale"
import { AlertTriangle } from "lucide-react"

export function FolderChecks() {
  const { ref, played } = usePlayOnScroll()

  return (
    <section id="checks" ref={ref} className="bg-white py-14 md:py-22">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-8 md:gap-13 px-5">
        <div className="order-2 min-w-0 flex-1 basis-[420px] md:order-1">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_14px_36px_rgba(28,25,23,.07)]">
            <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 px-4.5 py-3.5">
              <span className="font-display text-base font-bold text-slate-900">Folder report</span>
              <span className={`text-slate-600 ${MOCK_TYPE.supporting}`}>42 documents, 42 processed</span>
            </div>
            <div className="flex flex-col gap-3.5 px-4.5 py-4.5">
              <div className={played ? IN : ""} style={played ? { animationDelay: ".15s" } : undefined}>
                <div className={`mb-1.5 text-slate-600 ${MOCK_TYPE.label}`}>Groups</div>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  <div className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-semibold text-slate-800 ${MOCK_TYPE.evidence}`}>Invoice · Northwind Trading</span>
                      <span className={`rounded-full bg-slate-100 px-2 py-px font-semibold text-slate-600 ${MOCK_TYPE.supporting}`}>6</span>
                    </div>
                  </div>
                  <div className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-semibold text-slate-800 ${MOCK_TYPE.evidence}`}>Bank statement · Metro Bank</span>
                      <span className={`rounded-full bg-slate-100 px-2 py-px font-semibold text-slate-600 ${MOCK_TYPE.supporting}`}>11</span>
                    </div>
                    <div className={`mt-1.5 ${played ? POP : ""}`} style={played ? { animationDelay: "0.9s" } : undefined}>
                      <span className={`inline-block rounded bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-800 ${MOCK_TYPE.supporting}`}>January missing</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={played ? IN : ""} style={played ? { animationDelay: "1.1s" } : undefined}>
                <div className={`mb-1.5 text-slate-600 ${MOCK_TYPE.label}`}>Duplicates</div>
                <div className={`flex flex-wrap items-center gap-2 border-t border-indigo-100 bg-indigo-50 px-2.5 py-2 text-indigo-900 ${MOCK_TYPE.evidence}`}>
                  <span className="max-w-[11rem] break-words">INV-4471.pdf</span>
                  <span className="text-indigo-400">·</span>
                  <span className="max-w-[11rem] break-words">INV-4471 (1).pdf</span>
                  <span className={`ml-auto rounded bg-white/75 px-1.5 py-px font-semibold ${MOCK_TYPE.supporting}`}>exact copy</span>
                </div>
              </div>

              <div className={played ? IN : ""} style={played ? { animationDelay: "1.4s" } : undefined}>
                <div className={`mb-1.5 text-slate-600 ${MOCK_TYPE.label}`}>Needs attention</div>
                <div className="flex flex-col gap-1.5">
                  <div className={`flex items-center gap-2 border-t border-red-100 bg-red-50 px-2.5 py-2 text-red-900 ${MOCK_TYPE.evidence}`}>
                    <span className="min-w-0 flex-1 break-words">Line items don&apos;t sum to the stated total: receipt-cafe.heic</span>
                    <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0 text-red-700" />
                  </div>
                  <div className={`flex items-center gap-2 border-t border-red-100 bg-red-50 px-2.5 py-2 text-red-900 ${MOCK_TYPE.evidence}`}>
                    <span className="min-w-0 flex-1 break-words">No VAT number found: scan_0043.jpg</span>
                    <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0 text-red-700" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 min-w-0 flex-1 basis-[340px] md:order-2">
          <h2 className="text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-slate-900">
            The folder gets checked before you look at it
          </h2>
          <p className="mt-4 max-w-[31rem] text-pretty text-[1.02rem] leading-[1.62] text-slate-600">
            Every upload batch is grouped by type and supplier, paired against near-identical copies, and scanned for period gaps and per-document problems: totals that don&apos;t sum, fields that aren&apos;t there. The report is deterministic: the same folder gives the same answer twice.
          </p>
        </div>
      </div>
    </section>
  )
}

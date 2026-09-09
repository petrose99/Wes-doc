"use client"

import { IN, POP, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"
import { AlertTriangle } from "lucide-react"

export function FolderChecks() {
  const { ref, played } = usePlayOnScroll()

  return (
    <section id="checks" ref={ref} className="bg-cream-50 py-14 md:py-22">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-8 md:gap-13 px-5">
        <div className="order-2 min-w-0 flex-1 basis-[420px] md:order-1">
          <div className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_14px_36px_rgba(28,25,23,.07)]">
            <div className="flex flex-wrap items-baseline gap-2 border-b border-stone-100 px-4.5 py-3.5">
              <span className="font-display text-base font-bold text-stone-900">Folder report</span>
              <span className="text-[0.76rem] text-stone-500">42 documents, 42 processed</span>
            </div>
            <div className="flex flex-col gap-3.5 px-4.5 py-4.5">
              <div className={played ? IN : ""} style={played ? { animationDelay: ".15s" } : undefined}>
                <h4 className="mb-1.5 text-[0.66rem] font-bold uppercase tracking-[.07em] text-stone-500">Groups</h4>
                <div className="flex flex-col gap-1.5">
                  <div className="rounded-lg border border-stone-200 px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.8rem] font-semibold text-stone-800">Invoice · Northwind Trading</span>
                      <span className="rounded-full bg-stone-100 px-2 py-px text-[0.7rem] font-semibold text-stone-600">6</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-stone-200 px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.8rem] font-semibold text-stone-800">Bank statement · Metro Bank</span>
                      <span className="rounded-full bg-stone-100 px-2 py-px text-[0.7rem] font-semibold text-stone-600">11</span>
                    </div>
                    <div className={`mt-1.5 ${played ? POP : ""}`} style={played ? { animationDelay: "1.15s" } : undefined}>
                      <span className="inline-block rounded bg-indigo-100 px-2 py-0.5 text-[0.72rem] font-semibold text-indigo-800">January missing</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={played ? IN : ""} style={played ? { animationDelay: "1.5s" } : undefined}>
                <h4 className="mb-1.5 text-[0.66rem] font-bold uppercase tracking-[.07em] text-stone-500">Duplicates</h4>
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-2 text-[0.78rem] text-indigo-900">
                  <span className="max-w-[11rem] truncate">INV-4471.pdf</span>
                  <span className="text-indigo-400">·</span>
                  <span className="max-w-[11rem] truncate">INV-4471 (1).pdf</span>
                  <span className="ml-auto rounded bg-white/75 px-1.5 py-px text-[0.7rem] font-semibold">exact copy</span>
                </div>
              </div>

              <div className={played ? IN : ""} style={played ? { animationDelay: "1.95s" } : undefined}>
                <h4 className="mb-1.5 text-[0.66rem] font-bold uppercase tracking-[.07em] text-stone-500">Needs attention</h4>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-[0.78rem] text-red-900">
                    <span className="min-w-0 flex-1 truncate">Line items don&apos;t sum to the stated total — receipt-cafe.heic</span>
                    <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0 text-red-700" />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-[0.78rem] text-red-900">
                    <span className="min-w-0 flex-1 truncate">No VAT number found — scan_0043.jpg</span>
                    <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0 text-red-700" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 min-w-0 flex-1 basis-[340px] md:order-2">
          <span className="text-[0.74rem] font-bold uppercase tracking-[.08em] text-emerald-700">Folder checks</span>
          <h2 className="mt-3 text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-stone-900">
            The folder gets checked before you look at it
          </h2>
          <p className="mt-4 max-w-[31rem] text-pretty text-[1.02rem] leading-[1.62] text-stone-600">
            Every upload batch is grouped by type and supplier, paired against near-identical copies, and scanned for period gaps and per-document problems — totals that don&apos;t sum, fields that aren&apos;t there. The report is deterministic: the same folder gives the same answer twice.
          </p>
        </div>
      </div>
    </section>
  )
}

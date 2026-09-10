"use client"

import { IN, POP, SWEEP, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"
import { Target } from "lucide-react"

const FIELDS = [
  { label: "Supplier", value: "Northwind Trading", delay: 0.55 },
  { label: "Invoice no.", value: "INV-4471", delay: 0.95 },
  { label: "Issued", value: "14 Mar 2026", delay: 1.35 },
  { label: "VAT 20%", value: "£412.60", delay: 1.75 },
]

export function Provenance() {
  const { ref, played } = usePlayOnScroll()

  return (
    <section id="trace" ref={ref} className="border-y border-cream-200 bg-white py-14 md:py-22">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-8 md:gap-13 px-5">
        <div className="min-w-0 flex-1 basis-[360px]">
          <span className="text-[0.74rem] font-bold uppercase tracking-[.08em] text-emerald-700">Provenance</span>
          <h2 className="mt-3 text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-stone-900">
            Click the number, see the page it came from
          </h2>
          <p className="mt-4 max-w-[31rem] text-pretty text-[1.02rem] leading-[1.62] text-stone-600">
            Nothing is a black box. Every extracted value keeps a pointer to its document, its page and the exact spot it was read from. &quot;Where did this figure come from?&quot; is one click, not an afternoon in a folder.
          </p>
        </div>

        <div className="min-w-0 flex-1 basis-[420px]">
          <div className="flex flex-wrap gap-4 rounded-2xl border border-cream-200 bg-[#FEFDFB] p-4 shadow-[0_1px_2px_rgba(28,25,23,.04),0_14px_36px_rgba(28,25,23,.07)]">
            <div className="relative min-h-[286px] min-w-0 flex-1 basis-[210px] overflow-hidden rounded-[10px] border border-stone-100 bg-white p-4">
              <div className="text-[0.6rem] font-bold uppercase tracking-[.09em] text-stone-400">Northwind Trading Co.</div>
              <div className="my-2.5 h-px bg-stone-100" />
              <div className="flex flex-col gap-1.5">
                <div className="h-1.5 w-[82%] rounded bg-stone-200" />
                <div className="h-1.5 w-[64%] rounded bg-stone-200" />
                <div className="h-1.5 w-[71%] rounded bg-stone-200" />
              </div>
              <div className="my-3.5 h-px bg-stone-100" />
              <div className="flex flex-col gap-1.5">
                <div className="h-1.5 w-[90%] rounded bg-stone-200" />
                <div className="h-1.5 w-[76%] rounded bg-stone-200" />
                <div className="h-1.5 w-[88%] rounded bg-stone-200" />
                <div className="h-1.5 w-[58%] rounded bg-stone-200" />
              </div>
              <div className={`relative mt-4.5 flex items-center justify-between rounded-md bg-emerald-500/10 px-2 py-1.5 shadow-[inset_0_0_0_2px_#10B981] ${played ? POP : ""}`} style={played ? { animationDelay: "1.6s" } : undefined}>
                <span className="text-[0.62rem] font-semibold text-stone-500">TOTAL DUE</span>
                <span className="text-[0.76rem] font-bold text-stone-900">£2,475.60</span>
                <span className="absolute -right-1.5 -top-2.5 rounded-full bg-emerald-700 px-1.5 py-px text-[0.56rem] font-bold tracking-[.04em] text-white">PAGE 1</span>
              </div>
              <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 h-[34%] ${played ? SWEEP : "opacity-0"}`} style={{ background: "linear-gradient(to bottom, transparent, rgba(16,185,129,.24), transparent)" }} />
            </div>

            <div className="flex min-w-0 flex-1 basis-[190px] flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.68rem] font-bold uppercase tracking-[.07em] text-stone-500">Extracted</span>
                <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />reading page 1
                </span>
              </div>
              {FIELDS.map((field) => (
                <div key={field.label} className={`flex flex-wrap justify-between gap-2 rounded-lg border border-emerald-50 bg-[#F8FAF9] px-2.5 py-2 ${played ? IN : ""}`} style={played ? { animationDelay: `${field.delay}s` } : undefined}>
                  <span className="text-[0.74rem] text-stone-500">{field.label}</span>
                  <span className="text-[0.79rem] font-semibold text-stone-900">{field.value}</span>
                </div>
              ))}
              <div className={`flex justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2.5 ${played ? IN : ""}`} style={played ? { animationDelay: "1.4s" } : undefined}>
                <span className="text-[0.74rem] font-semibold text-emerald-700">Total</span>
                <span className="text-[0.85rem] font-bold text-emerald-900">£2,475.60</span>
              </div>
              <div className={`mt-auto flex items-start gap-1.5 pt-2.5 text-[0.7rem] leading-[1.45] text-stone-500 ${played ? IN : ""}`} style={played ? { animationDelay: "1.8s" } : undefined}>
                <Target aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                Total traced to page 1 — the source opens highlighted at that line.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

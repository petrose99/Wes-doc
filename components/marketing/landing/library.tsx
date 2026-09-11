"use client"

import { IN, POP, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"
import { FileText, Search, Sparkles } from "lucide-react"

const SOURCES = [
  { doc: "merck-invoice-0312.pdf", page: "p.1", match: "94% match", quote: "“…laboratory reagents and analytical standards supplied by Merck KGaA, Darmstadt…”", delay: 0.85 },
  { doc: "sigma-aldrich-mar.pdf", page: "p.2", match: "89% match", quote: "“…Sigma-Aldrich Chemie GmbH — solvents, buffers and reference materials…”", delay: 1.2 },
]

/** Archive — the section that used to be called Docu Search on the landing. Renamed to match the
 * app; the surface's job is the permanent, searchable record every reviewed document lands in.
 * Search is the hero interaction inside the page (the demo shot leads with the question box) so
 * the archive framing does not undersell the retrieval power. */
export function Library() {
  const { ref, played } = usePlayOnScroll()

  return (
    <section
      id="archive"
      ref={ref}
      className="relative overflow-hidden bg-cream-50 py-14 md:py-22"
      style={{ backgroundImage: "radial-gradient(#e7dcc7 1px,transparent 1.4px)", backgroundSize: "24px 24px" }}
    >
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-28 h-96 w-96 rounded-full" style={{ background: "radial-gradient(circle, rgba(16,185,129,.09), transparent 70%)" }} />
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-8 md:gap-13 px-5">
        <div className="min-w-0 flex-1 basis-[340px]">
          <h2 className="text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-stone-950">
            Ask a question, get the document that answers it
          </h2>
          <p className="mt-4 max-w-[31rem] text-pretty text-[1.02rem] leading-[1.62] text-stone-600">
            Every reviewed document lands in the Archive automatically — the permanent record of what came in, what it said, and when. Search it by meaning as well as words: ask a plain question and DocuBite answers from your own documents, each answer cited to the filename and page it came from, one click from the source. Auditors get a link; you keep the source.
          </p>
        </div>

        <div className="min-w-0 flex-1 basis-[440px]">
          <div className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_14px_36px_rgba(28,25,23,.08)]">
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3.5">
              <Search aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 text-[0.82rem] text-slate-700">Which invoices came from a chemistry supplier?</span>
              <span className="inline-flex h-[26px] items-center rounded-md bg-emerald-700 px-3 text-[0.72rem] font-bold text-white">Ask</span>
            </div>
            <div className="flex flex-col gap-2.5 px-4 py-3.5">
              <div className={`flex gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3.5 py-3 ${played ? POP : ""}`} style={played ? { animationDelay: ".4s" } : undefined}>
                <Sparkles aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <p className="text-[0.82rem] leading-[1.5] text-emerald-800">
                  Two invoices are from chemistry suppliers — <strong>Merck KGaA</strong> and <strong>Sigma-Aldrich</strong>, both March 2026.
                </p>
              </div>
              <span className="text-[0.62rem] font-bold uppercase tracking-[.06em] text-stone-400">Cited from</span>
              {SOURCES.map((source) => (
                <div key={source.doc} className={`rounded-lg border border-slate-100 px-3 py-2.5 ${played ? IN : ""}`} style={played ? { animationDelay: `${source.delay}s` } : undefined}>
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText aria-hidden className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-[0.78rem] font-semibold text-slate-900">{source.doc}</span>
                    <span className="rounded bg-indigo-100 px-1.5 py-px text-[0.64rem] font-bold text-indigo-800">{source.page}</span>
                    <span className="ml-auto text-[0.66rem] font-semibold text-emerald-700">{source.match}</span>
                  </div>
                  <p className="mt-1.5 text-[0.73rem] leading-[1.45] text-slate-500">{source.quote}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

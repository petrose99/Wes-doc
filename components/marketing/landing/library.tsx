"use client"

import { IN, POP, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"
import { MOCK_TYPE } from "@/components/marketing/landing/_lib/mock-scale"
import { FileText, Search, Sparkles } from "lucide-react"

const SOURCES = [
  { doc: "merck-invoice-0312.pdf", page: "p.1", match: "94% match", quote: "“…laboratory reagents and analytical standards supplied by Merck KGaA, Darmstadt…”", delay: 0.85 },
  { doc: "sigma-aldrich-mar.pdf", page: "p.2", match: "89% match", quote: "“…Sigma-Aldrich Chemie GmbH: solvents, buffers and reference materials…”", delay: 1.2 },
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
      className="relative overflow-hidden bg-white py-14 md:py-22"
    >
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-8 md:gap-13 px-5">
        <div className="min-w-0 flex-1 basis-[340px]">
          <h2 className="text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-slate-950">
            Ask a question, get the document that answers it
          </h2>
          <p className="mt-4 max-w-[31rem] text-pretty text-[1.02rem] leading-[1.62] text-slate-600">
            Every reviewed document lands in the Archive automatically, the permanent record of what came in, what it said, and when. Search it by meaning as well as words: ask a plain question and DocuBite answers from your own documents, each answer cited to the filename and page it came from, one click from the source. Auditors get a link; you keep the source.
          </p>
        </div>

        <div className="min-w-0 flex-1 basis-[440px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_14px_36px_rgba(28,25,23,.08)]">
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3.5">
              <Search aria-hidden className="h-4 w-4 shrink-0 text-slate-600" />
              <span className={`min-w-0 flex-1 break-words text-slate-700 ${MOCK_TYPE.evidence}`}>Which invoices came from a chemistry supplier?</span>
              <span className={`inline-flex h-7 items-center rounded-md bg-emerald-700 px-3 font-bold text-white ${MOCK_TYPE.supporting}`}>Ask</span>
            </div>
            <div className="flex flex-col gap-2.5 px-4 py-3.5">
              <div className={`flex gap-2 border-l-2 border-emerald-500 bg-emerald-50 px-3.5 py-3 ${played ? POP : ""}`} style={played ? { animationDelay: ".4s" } : undefined}>
                <Sparkles aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <p className={`text-emerald-800 ${MOCK_TYPE.evidence}`}>
                  Two invoices are from chemistry suppliers: <strong>Merck KGaA</strong> and <strong>Sigma-Aldrich</strong>, both March 2026.
                </p>
              </div>
              <span className={`text-slate-600 ${MOCK_TYPE.label}`}>Cited from</span>
              {SOURCES.map((source) => (
                <div key={source.doc} className={`border-t border-slate-100 pt-2.5 ${played ? IN : ""}`} style={played ? { animationDelay: `${source.delay}s` } : undefined}>
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText aria-hidden className="h-3.5 w-3.5 text-slate-600" />
                    <span className={`break-words font-semibold text-slate-900 ${MOCK_TYPE.evidence}`}>{source.doc}</span>
                    <span className={`rounded bg-indigo-100 px-1.5 py-px font-bold text-indigo-800 ${MOCK_TYPE.supporting}`}>{source.page}</span>
                    <span className={`ml-auto font-semibold text-emerald-700 ${MOCK_TYPE.supporting}`}>{source.match}</span>
                  </div>
                  <p className={`mt-1.5 max-w-[25rem] text-slate-600 ${MOCK_TYPE.supporting}`}>{source.quote}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

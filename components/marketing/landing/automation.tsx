"use client"

import { GROW, IN, POP, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"
import { Check, Sparkles } from "lucide-react"

/** Automation — the product stops asking questions it already knows the answer to.
 *
 * The animation is the claim: three invoices from the same supplier get coded the same way, and on
 * the third the engine stops asking and starts applying. That is literally the rule
 * (HISTORY_APPLY_THRESHOLDS — three confirmations at 90% agreement), so the sequence is the
 * mechanism rather than a decorative reveal, and the "Codes itself" badge lands only after the
 * third row, never before.
 *
 * The ladder rungs fill on entry to show how far a workspace has handed over, with only the first
 * lit: every workspace starts at Suggest, and a section arguing "you choose how far this goes"
 * must not animate itself into the top rung. */

const RUNGS = [
  { name: "Suggest", body: "Coding is proposed. Every document still waits for you.", lit: true },
  { name: "Auto with approval", body: "Coding is applied. You confirm it with one click.", lit: false },
  { name: "Touchless", body: "Confident documents publish themselves. The rest still come to you.", lit: false },
]

const HISTORY = [
  { doc: "INV-4471", month: "January", delay: 0.35 },
  { doc: "INV-4602", month: "February", delay: 0.75 },
  { doc: "INV-4771", month: "March", delay: 1.15 },
]

const POINTS = [
  {
    title: "New suppliers have to earn it",
    body: "A supplier’s first documents always reach a person, whatever the confidence score. The bar it has to clear only drops once a run of them comes back clean.",
  },
  {
    title: "It ties the paperwork together",
    body: "Purchase order to invoice to receipt, and bank lines to the invoices they paid — matched for you, so accepting one closes the loop in the ledger too.",
  },
]

const GUARDS = [
  "A confidence floor nothing publishes below",
  "Lower bars for small amounts, higher for large",
  "Your spending policy, in plain English",
  "A sample of the automatic work reviewed anyway",
]

export function Automation() {
  const { ref, played } = usePlayOnScroll()

  return (
    <section
      id="automation"
      ref={ref}
      className="relative overflow-hidden border-y border-cream-200 bg-cream-50 py-16 md:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-1/4 h-[30rem] w-[30rem] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,.12), transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-6xl px-5">
        <div className="max-w-[44rem]">
          <span className="text-[0.74rem] font-bold uppercase tracking-[.08em] text-emerald-700">Controls</span>
          <h2 className="mt-3 text-balance font-display text-[clamp(2.05rem,3.4vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.035em] text-stone-950">
            It watches how you code, then stops asking
          </h2>
          <p className="mt-5 text-pretty text-[1.06rem] leading-[1.62] text-stone-600">
            Three invoices from the same supplier, coded the same way, and the fourth codes itself. Nothing
            switches on by itself, though — you decide how far the pipeline may go without you, and you can see
            exactly how much of last month actually went through untouched before you move it again.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-start gap-8 md:gap-12">
          <div className="min-w-0 flex-1 basis-[430px]">
            <div className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_18px_44px_rgba(28,25,23,.09)]">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                <span className="truncate font-display text-[0.95rem] font-bold text-slate-900">Northwind Trading</span>
                <span className="shrink-0 text-[0.72rem] font-semibold text-slate-400">Coding history</span>
              </div>

              <div className="flex flex-col gap-2 px-5 py-4">
                {HISTORY.map((row) => (
                  <div
                    key={row.doc}
                    className={`flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 ${played ? IN : ""}`}
                    style={played ? { animationDelay: `${row.delay}s` } : undefined}
                  >
                    <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={2.8} />
                    <span className="min-w-0 flex-1 truncate text-[0.8rem] font-semibold text-slate-800">{row.doc}</span>
                    <span className="shrink-0 text-[0.72rem] text-slate-400">{row.month}</span>
                    <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-mono text-[0.7rem] text-slate-600 ring-1 ring-slate-200">
                      6000
                    </span>
                  </div>
                ))}
              </div>

              <div
                className={`flex items-center gap-2.5 border-t border-emerald-100 bg-emerald-50 px-5 py-3.5 ${played ? POP : ""}`}
                style={played ? { animationDelay: "1.7s" } : undefined}
              >
                <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-emerald-700" strokeWidth={2.2} />
                <p className="text-[0.84rem] font-semibold text-emerald-900">
                  Codes itself from here. The AI is not asked again.
                </p>
              </div>
            </div>

            <dl className="mt-7 divide-y divide-cream-200 border-t border-cream-200">
              {POINTS.map((point) => (
                <div key={point.title} className="py-4">
                  <dt className="font-display text-[1.02rem] font-bold tracking-[-0.01em] text-stone-900">{point.title}</dt>
                  <dd className="mt-1.5 text-pretty text-[0.94rem] leading-[1.58] text-stone-600">{point.body}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="min-w-0 flex-1 basis-[380px]">
            <h3 className="font-display text-[1.05rem] font-bold tracking-[-0.02em] text-stone-900">How far it may go is your call</h3>
            <div className="mt-3.5 flex flex-col gap-2">
              {RUNGS.map((rung, i) => (
                <div
                  key={rung.name}
                  className={`rounded-xl border bg-white p-4 ${rung.lit ? "border-emerald-200 shadow-panel" : "border-cream-200"}`}
                >
                  <span className="mb-3 block h-1 overflow-hidden rounded-full bg-stone-100" aria-hidden>
                    <span
                      className={`block h-full origin-left rounded-full ${rung.lit ? "bg-emerald-600" : "bg-stone-200"} ${played ? GROW : ""}`}
                      style={{ width: rung.lit ? "100%" : "22%", ...(played ? { animationDelay: `${0.2 + i * 0.12}s` } : {}) }}
                    />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <h4 className="font-display text-[1rem] font-bold tracking-[-0.01em] text-stone-900">{rung.name}</h4>
                    {rung.lit && <span className="text-[0.72rem] font-bold text-emerald-700">Where everyone starts</span>}
                  </div>
                  <p className="mt-1 text-pretty text-[0.88rem] leading-[1.5] text-stone-600">{rung.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-cream-200 bg-white/70 p-4">
              <h4 className="font-display text-[0.98rem] font-bold tracking-[-0.01em] text-stone-900">What still stops it</h4>
              <ul className="mt-2 flex flex-col gap-1.5">
                {GUARDS.map((guard) => (
                  <li key={guard} className="flex items-start gap-2 text-[0.86rem] leading-[1.5] text-stone-600">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-emerald-600" aria-hidden />
                    {guard}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

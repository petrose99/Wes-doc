"use client"

import { IN, POP, usePlayOnScroll } from "@/components/marketing/landing/_lib/use-play-on-scroll"
import { MOCK_TYPE } from "@/components/marketing/landing/_lib/mock-scale"
import { Check } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const TARGETS = { inbox: 12, review: 7, ready: 23 }

/** Counts 0 → the real totals over ~1.5s once the section plays, matching the source's countUp():
 * 18 steps, 70ms apart, kicked off 300ms after the play state flips (so it starts once the cards
 * around it are already animating in, not before). */
function useCountUp(played: boolean) {
  const [counts, setCounts] = useState({ inbox: 0, review: 0, ready: 0 })
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (!played) return
    timers.current.push(setTimeout(() => setCounts({ inbox: 0, review: 0, ready: 0 }), 0))
    const steps = 18
    for (let i = 1; i <= steps; i++) {
      timers.current.push(
        setTimeout(() => {
          const t = i / steps
          setCounts({
            inbox: Math.round(TARGETS.inbox * t),
            review: Math.round(TARGETS.review * t),
            ready: Math.round(TARGETS.ready * t),
          })
        }, 300 + i * 70),
      )
    }
    return () => timers.current.forEach(clearTimeout)
  }, [played])

  return counts
}

export function Pipeline() {
  const { ref, played } = usePlayOnScroll()
  const counts = useCountUp(played)

  return (
    <section
      id="pipeline"
      ref={ref}
      className="relative border-y border-slate-200 bg-white py-14 md:py-22"
    >
      <div className="relative mx-auto max-w-6xl px-5">
        <div className="max-w-[42rem]">
          <div className="min-w-0">
            <h2 className="text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-slate-950">
              One queue, from inbox to approved
            </h2>
            <p className="mt-4 max-w-[38rem] text-pretty text-[1.02rem] leading-[1.62] text-slate-600">
              Documents move through Inbox, To review and Ready, badged with what&apos;s waiting on a person so nothing sits unnoticed. Keep one workspace for your business, or a separate one per client, with owner and member roles and approval workflows for what needs a second pair of eyes.
            </p>
          </div>
        </div>

        <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
          <div className="rounded-2xl border border-slate-200 border-t-[3px] border-t-slate-300 bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-2.5">
              <span className={`font-bold text-slate-900 ${MOCK_TYPE.evidence}`}>Inbox</span>
              <span className={`rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-600 ${MOCK_TYPE.supporting}`}>{counts.inbox}</span>
            </div>
            <p className={`mb-3 mt-1.5 text-slate-600 ${MOCK_TYPE.supporting}`}>Uploaded, being read</p>
            <div className="flex flex-col gap-1.5">
              {["statement-mar.pdf", "IMG_3312.jpg"].map((name, i) => (
                <div key={name} className={`flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-2.5 py-2 text-slate-700 first:border-t-0 ${MOCK_TYPE.evidence} ${played ? IN : ""}`} style={played ? { animationDelay: `${0.1 + i * 0.2}s` } : undefined}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                  <span className="min-w-0 break-words">{name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 border-t-[3px] border-t-indigo-500 bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-2.5">
              <span className={`font-bold text-slate-900 ${MOCK_TYPE.evidence}`}>To review</span>
              <span className={`rounded-full bg-indigo-600 px-2.5 py-0.5 font-bold text-white ${MOCK_TYPE.supporting}`}>{counts.review}</span>
            </div>
            <p className={`mb-3 mt-1.5 text-slate-600 ${MOCK_TYPE.supporting}`}>Waiting on a person</p>
            <div className="flex flex-col gap-1.5">
              <div className={`flex flex-wrap items-center gap-2 border-t border-violet-100 bg-violet-50 px-2.5 py-2 text-indigo-800 first:border-t-0 ${MOCK_TYPE.evidence} ${played ? IN : ""}`} style={played ? { animationDelay: ".75s" } : undefined}>
                <span className="min-w-0 flex-1 break-words">receipt-cafe.heic</span>
                <span className={`rounded bg-red-100 px-1.5 py-px font-bold text-red-800 ${MOCK_TYPE.supporting}`}>total</span>
              </div>
              <div className={`flex flex-wrap items-center gap-2 border-t border-violet-100 bg-violet-50 px-2.5 py-2 text-indigo-800 ${MOCK_TYPE.evidence} ${played ? IN : ""}`} style={played ? { animationDelay: ".95s" } : undefined}>
                <span className="min-w-0 flex-1 break-words">INV-4471 (1).pdf</span>
                <span className={`rounded bg-red-100 px-1.5 py-px font-bold text-red-700 ${MOCK_TYPE.supporting}`}>dupe</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 border-t-[3px] border-t-emerald-500 bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-2.5">
              <span className={`font-bold text-slate-900 ${MOCK_TYPE.evidence}`}>Ready</span>
              <span className={`rounded-full bg-emerald-700 px-2.5 py-0.5 font-bold text-white ${MOCK_TYPE.supporting}`}>{counts.ready}</span>
            </div>
            <p className={`mb-3 mt-1.5 text-slate-600 ${MOCK_TYPE.supporting}`}>Approved, exportable</p>
            <div className="flex flex-col gap-1.5">
              <div className={`flex flex-wrap items-center gap-2 border-t border-slate-100 bg-[#F8FAF9] px-2.5 py-2 text-slate-700 first:border-t-0 ${MOCK_TYPE.evidence} ${played ? IN : ""}`} style={played ? { animationDelay: "1s" } : undefined}>
                <span className="min-w-0 flex-1 break-words">INV-4471.pdf</span>
                <span className="font-bold text-slate-900">£2,475.60</span>
              </div>
              <div className={`flex flex-wrap items-center gap-2 border-t border-slate-100 bg-[#F8FAF9] px-2.5 py-2 text-slate-700 ${MOCK_TYPE.evidence} ${played ? IN : ""}`} style={played ? { animationDelay: "1.15s" } : undefined}>
                <span className="min-w-0 flex-1 break-words">scan_0043.jpg</span>
                <span className="font-bold text-slate-900">£86.40</span>
              </div>
              <div className={`flex items-center gap-2 border-t border-emerald-200 bg-emerald-50 px-2.5 py-2 font-semibold text-emerald-800 ${MOCK_TYPE.evidence} ${played ? POP : ""}`} style={played ? { animationDelay: "1.4s" } : undefined}>
                <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-700" strokeWidth={2.6} />
                23 approved bills exported to CSV
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

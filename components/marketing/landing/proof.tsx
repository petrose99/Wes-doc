import { Download, Globe, ListChecks, Lock } from "lucide-react"

/** Trust-signal strip. Built from FACTS already asserted elsewhere on the page (private encrypted
 * storage, multi-currency FX, CSV export and reviewable work), with no fabricated customer counts or logos.
 *
 * TODO(marketing): once we have real numbers or a real customer quote, swap the strip below for a
 * customer-count + one-line testimonial pattern. Until then, honest trust signals beat empty
 * placeholders and beat fake numbers. */
const SIGNALS: { icon: typeof Lock; label: string; sub: string }[] = [
  { icon: Lock, label: "Private encrypted storage", sub: "Keys managed for you" },
  { icon: Globe, label: "Multi-currency work", sub: "Historical FX rates built in" },
  { icon: Download, label: "Your data, exportable", sub: "CSV, columns and all" },
  { icon: ListChecks, label: "Review before posting", sub: "Uncertain values stay visible" },
]

export function Proof() {
  return (
    <section aria-label="Trust signals" className="bg-white py-10">
      <div className="mx-auto grid max-w-6xl grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 px-5">
        {SIGNALS.map(({ icon: Icon, label, sub }) => (
          <div key={label} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" strokeWidth={1.9} />
            <div>
              <div className="text-[0.9rem] font-semibold text-slate-900">{label}</div>
              <div className="text-[0.78rem] text-slate-600">{sub}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

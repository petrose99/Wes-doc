import { Download, Lock, MapPin, RefreshCcw } from "lucide-react"

/** Trust-signal strip. Built from FACTS already asserted elsewhere on the page (private encrypted
 * storage, CSV export, no bank switch, CMA coverage) — no fabricated customer counts or logos.
 *
 * TODO(marketing): once we have real numbers or a real customer quote, swap the strip below for a
 * customer-count + one-line testimonial pattern. Until then, honest trust signals beat empty
 * placeholders and beat fake numbers. */
const SIGNALS: { icon: typeof Lock; label: string; sub: string }[] = [
  { icon: Lock, label: "Private encrypted storage", sub: "Keys managed for you" },
  { icon: MapPin, label: "SA + CMA out of the box", sub: "Same rails, no bank switch" },
  { icon: Download, label: "Your data, exportable", sub: "CSV, columns and all" },
  { icon: RefreshCcw, label: "No long-term contract", sub: "Cancel at any time" },
]

export function Proof() {
  return (
    <section aria-label="Trust signals" className="bg-cream-50 py-10">
      <div className="mx-auto grid max-w-6xl grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 px-5">
        {SIGNALS.map(({ icon: Icon, label, sub }) => (
          <div key={label} className="flex items-start gap-3 rounded-xl border border-cream-200 bg-white px-4 py-3">
            <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" strokeWidth={1.9} />
            <div>
              <div className="text-[0.9rem] font-semibold text-stone-900">{label}</div>
              <div className="text-[0.78rem] text-stone-500">{sub}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

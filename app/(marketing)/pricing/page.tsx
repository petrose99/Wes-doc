import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { absolute: "Pricing — DocuBite" },
  description: "Simple pricing for DocuBite. No card required for the 14-day trial.",
}

/** Placeholder pricing page. Nav needs a Pricing target so visitors don't hit the trial CTA with
 * "what happens on day 15?" anxiety. TODO(product): replace the tier grid below with real plans and
 * numbers before public launch. Do not fabricate figures here. */
export default function PricingPage() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-3.5 py-1.5 text-[0.78rem] font-semibold text-emerald-700">
          Pricing
        </span>
        <h1 className="mt-5 font-display text-[clamp(2.4rem,4.6vw,3.6rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-stone-950">
          Simple pricing. Start free.
        </h1>
        <p className="mt-5 max-w-[36rem] text-[1.06rem] leading-[1.6] text-stone-600">
          A 14-day free trial with no card required. If DocuBite fits your AP loop we&apos;ll show you the plan that matches your volume — and there are no long-term contracts.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/signup" className="inline-flex h-12 items-center rounded-[10px] bg-emerald-700 px-6.5 text-[0.98rem] font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,.08),0_10px_26px_rgba(4,120,87,.24)] transition-colors hover:bg-emerald-800">
            Start 14-day free trial
          </Link>
          <Link href="/demo" className="inline-flex h-12 items-center rounded-[10px] border border-stone-200 bg-white px-6 text-[0.98rem] font-semibold text-stone-900 shadow-sm transition-colors hover:bg-stone-50">
            Talk to us about pricing
          </Link>
        </div>
        <p className="mt-4 text-[0.82rem] text-stone-500">No card required. Files held in private encrypted storage.</p>
      </div>
    </section>
  )
}

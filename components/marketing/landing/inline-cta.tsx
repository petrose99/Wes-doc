import Link from "next/link"

/** A compact mid-page CTA rendered between ApLoop and HowItWorks. The full TrialCta sits at the
 * bottom of the page; this one catches a reader who has just finished the seven-step AP-loop
 * story and might be persuaded before they scroll through the rest of the sections. Deliberately
 * reuses TrialCta's "one messy folder" framing so the two CTAs read as the same offer, not two
 * competing ones. */
export function InlineTrialCta() {
  return (
    <section className="border-y border-cream-200 bg-white py-10 md:py-12">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-5 px-5">
        <div className="min-w-0 flex-1 basis-[320px]">
          <h3 className="font-display text-[clamp(1.35rem,2vw,1.65rem)] font-bold leading-tight tracking-[-0.02em] text-stone-900">
            Start with one messy folder
          </h3>
          <p className="mt-1 max-w-[36rem] text-[0.98rem] leading-[1.55] text-stone-600">
            Upload the worst one you have. If what comes back doesn&apos;t tell you something you didn&apos;t know, you&apos;ve lost ten minutes.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Link href="/signup" className="inline-flex h-11 items-center rounded-[10px] bg-emerald-700 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-800">
            Start 14-day free trial
          </Link>
          <Link href="/demo" className="inline-flex h-11 items-center rounded-[10px] border border-stone-200 bg-white px-5 text-sm font-semibold text-stone-900 shadow-sm transition-colors hover:bg-stone-50">
            Book a demo
          </Link>
        </div>
      </div>
    </section>
  )
}

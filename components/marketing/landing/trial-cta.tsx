import Link from "next/link"

export function TrialCta() {
  return (
    <section
      id="trial"
      className="relative overflow-hidden border-t border-cream-200 bg-cream-50 py-16 md:py-24"
      style={{ backgroundImage: "radial-gradient(#e7dcc7 1px, transparent 1.4px)", backgroundSize: "24px 24px" }}
    >
      <div aria-hidden className="pointer-events-none absolute -bottom-36 left-1/2 h-[360px] w-[560px] -translate-x-1/2 rounded-full" style={{ background: "radial-gradient(circle, rgba(16,185,129,.12), transparent 70%)" }} />
      <div className="relative mx-auto max-w-[820px] px-5 text-center">
        <h2 className="text-balance font-display text-[clamp(2.1rem,3.6vw,3.1rem)] font-extrabold leading-[1.05] tracking-[-0.035em] text-stone-950">
          Start with{" "}
          <span style={{ backgroundImage: "linear-gradient(180deg,transparent 56%,#6EE7B7 56%,#6EE7B7 93%,transparent 93%)", padding: "0 .04em" }}>one messy folder</span>
        </h2>
        <p className="mx-auto mt-4.5 max-w-[34rem] text-pretty text-[1.06rem] leading-[1.6] text-stone-600">
          Upload the worst one you have. If the report doesn&apos;t tell you something you didn&apos;t know, you&apos;ve lost ten minutes.
        </p>
        <div className="mt-7.5 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="inline-flex h-[50px] items-center rounded-[10px] bg-emerald-700 px-7 text-base font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,.08),0_10px_26px_rgba(4,120,87,.24)] transition-colors hover:bg-emerald-800">
            Start 14-day free trial
          </Link>
          <Link href="/demo" className="inline-flex h-[50px] items-center rounded-[10px] border border-stone-200 bg-white px-6.5 text-base font-semibold text-stone-900 shadow-sm transition-colors hover:bg-stone-50">
            Request a demo
          </Link>
        </div>
        <p className="mt-3.5 text-[0.83rem] text-stone-500">No card required. You still pay from your own bank — DocuBite prepares the file, your bank sends the money.</p>
      </div>
    </section>
  )
}

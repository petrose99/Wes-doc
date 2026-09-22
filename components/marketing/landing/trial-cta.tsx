import Link from "next/link"

export function AccountCta() {
  return (
    <section
      id="get-started"
      className="relative overflow-hidden border-t border-slate-200 bg-white py-16 md:py-24"
    >
      <div className="relative mx-auto max-w-[820px] px-5 text-center">
        <h2 className="text-balance font-display text-[clamp(2.1rem,3.6vw,3.1rem)] font-extrabold leading-[1.05] tracking-[-0.035em] text-slate-950">
          Start with{" "}
          <span style={{ backgroundImage: "linear-gradient(180deg,transparent 56%,#6EE7B7 56%,#6EE7B7 93%,transparent 93%)", padding: "0 .04em" }}>one messy folder</span>
        </h2>
        <p className="mx-auto mt-4.5 max-w-[34rem] text-pretty text-[1.06rem] leading-[1.6] text-slate-600">
          Upload a folder of documents and see which fields need your attention before they reach your books.
        </p>
        <div className="mt-7.5 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="inline-flex h-[50px] items-center rounded-[10px] bg-emerald-700 px-7 text-base font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,.08),0_10px_26px_rgba(4,120,87,.24)] transition-colors hover:bg-emerald-800">
            Create an account
          </Link>
          <Link href="/demo" className="inline-flex h-[50px] items-center rounded-[10px] border border-slate-200 bg-white px-6.5 text-base font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50">
            Request a demo
          </Link>
        </div>
        <Link href="/pricing" className="mt-4 inline-flex text-sm font-semibold text-emerald-800 underline decoration-emerald-200 underline-offset-4 hover:decoration-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
          See pricing
        </Link>
          <p className="mx-auto mt-3.5 max-w-[26rem] text-pretty text-[0.83rem] leading-[1.55] text-slate-600">Create an account to explore your workspace. You still pay from your own bank. DocuBite prepares the file, and your bank sends the money.</p>
      </div>
    </section>
  )
}

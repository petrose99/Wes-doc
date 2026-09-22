import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { absolute: "Pricing — DocuBite" },
  description: "Understand where DocuBite fits your AP workflow. Create an account to explore the workspace or request an Enterprise demo.",
}

/** Neutral pricing entry point until real plans and numbers exist. Do not fabricate figures here. */
export default function PricingPage() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[0.78rem] font-semibold text-emerald-700">
          Pricing
        </span>
        <h1 className="mt-5 font-display text-[clamp(2.4rem,4.6vw,3.6rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-slate-950">
          See how DocuBite fits your workflow.
        </h1>
        <p className="mt-5 max-w-[36rem] text-[1.06rem] leading-[1.6] text-slate-600">
          Create an account to explore the workspace. For larger teams, request an Enterprise demo to discuss your setup.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/signup" className="inline-flex h-12 items-center rounded-[10px] bg-emerald-700 px-6.5 text-[0.98rem] font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,.08),0_10px_26px_rgba(4,120,87,.24)] transition-colors hover:bg-emerald-800">
            Create an account
          </Link>
          <Link href="/demo" className="inline-flex h-12 items-center rounded-[10px] border border-slate-200 bg-white px-6 text-[0.98rem] font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50">
            Request an Enterprise demo
          </Link>
        </div>
        <p className="mt-4 text-[0.82rem] text-slate-600">Files are held in private encrypted storage.</p>
      </div>
    </section>
  )
}

import { BadgeCheck, FileText } from "lucide-react"
import Link from "next/link"

const FIELDS = [
  ["Supplier", "Mahlangu Office Supplies"],
  ["Invoice number", "INV-4471"],
  ["Subtotal", "R 2,840.00"],
  ["VAT", "R 568.00"],
] as const

/** The homepage hero. Wedge in the headline: DocuBite is the AP system that works with an existing
 * ledger OR brings its own — every competitor is one or the other, never both. The paper mock
 * keeps the homepage focused on the document entering the system; the app-window proof lives on
 * Product where the visitor is ready for mechanism detail.
 *
 * The scan-line sweep is decorative and never reacts to anything, so — like .doc-scan in
 * app/globals.css — it's plain CSS, not a client component: nothing here needs an IntersectionObserver. */
export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-slate-200 bg-white pb-14 md:pb-24"
    >
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-10 px-5 pt-10 md:gap-14 md:pt-16">
        <div className="min-w-0 flex-1 basis-[400px]">
          <h1 className="text-balance font-display text-[clamp(2.4rem,4.6vw,4.05rem)] font-extrabold leading-[1.02] tracking-[-0.038em] text-slate-950">
            Works with your books:{" "}
            <span style={{ backgroundImage: "linear-gradient(180deg,transparent 56%,#6EE7B7 56%,#6EE7B7 93%,transparent 93%)", padding: "0 .04em" }}>or brings its own</span>.
          </h1>
          <p className="mt-6 max-w-[34rem] text-pretty text-[1.08rem] leading-[1.62] text-slate-600">
            Bills arrive by email, upload or API. DocuBite accepts PDFs and image files, including scans and camera photos. It parses each page to text, flags uncertain values for review, routes approvals, then posts reviewed work to <strong className="font-semibold text-slate-800">QuickBooks, Xero or the built-in ledger</strong>. Payment stays on your bank&apos;s rails.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="group inline-flex h-12 items-center rounded-[10px] bg-emerald-700 px-6.5 text-[0.98rem] font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,.08),0_10px_26px_rgba(4,120,87,.24)] transition-colors hover:bg-emerald-800">
              Create an account
            </Link>
            <Link href="/demo" className="inline-flex h-12 items-center rounded-[10px] border border-slate-200 bg-white px-6 text-[0.98rem] font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50">
              Request a demo
            </Link>
          </div>
          <p className="mt-3.5 text-[0.82rem] text-slate-600">Create an account to explore your workspace. Files are held in private encrypted storage.</p>
        </div>

        <div className="min-w-0 flex-1 basis-[440px]">
          <div className="relative mx-auto max-w-md px-4 pb-4">
            <div aria-hidden className="absolute inset-x-8 bottom-0 top-4 rotate-[4deg] rounded-sm bg-slate-100 shadow-[0_22px_44px_-34px_rgba(15,23,42,.38)]" />
            <div className="relative -rotate-[2.5deg] border border-slate-200 bg-white p-5 shadow-[0_24px_54px_-32px_rgba(15,23,42,.45)] sm:p-7">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <FileText aria-hidden className="h-4 w-4 text-emerald-700" />
                    Invoice · INV-4471
                  </div>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[.08em] text-slate-600">Example · South Africa</p>
                </div>
                <span className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">Received</span>
              </div>
              <dl className="divide-y divide-slate-100">
                {FIELDS.map(([label, value]) => (
                  <div key={label} className="flex flex-wrap justify-between gap-4 py-3 text-sm">
                    <dt className="text-slate-600">{label}</dt>
                    <dd className="font-semibold text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap justify-between gap-4 border-t border-slate-200 pt-4 text-base font-bold text-slate-950">
                <span>Total due</span>
                <span>R 3,408.00</span>
              </div>
              <div className="mt-6 flex items-start gap-2.5 border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-900">
                <BadgeCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <span>Reviewable fields with source provenance</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

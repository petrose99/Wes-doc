import { ArrowRight, CheckCircle2 } from "lucide-react"
import Link from "next/link"

/** THE AP-loop section: three acts, each naming the steps it covers in its kicker. This replaced
 * the seven-card rail — seven tiles read as seven chores, three acts read as a shape. The deep-dive
 * sections below (Intake, Extraction, Checks, Pipeline, Automation) carry the step-level detail,
 * and the "Not on the list" note keeps the no-money-movement trust beat that lived on the rail. */
const ACTS: { n: string; title: string; steps: string; body: string }[] = [
  {
    n: "01",
    title: "In",
    steps: "Capture · Code · Check",
    body: "Bills arrive by email, upload or API. Every field is read, duplicates are paired, and checks surface anomalies before anyone looks at the work.",
  },
  {
    n: "02",
    title: "Through",
    steps: "Match · Approve",
    body: "Each bill is tied to its PO and routed to the right approver by amount. Discrepancies surface with the numbers side by side. Your controls, not ours.",
  },
  {
    n: "03",
    title: "Out",
    steps: "Sync · Pay-ready",
    body: "Approved bills post to the built-in ledger or sync to QuickBooks and Xero. One click assembles the bank-ready payment file with per-supplier remittance advice; you upload it to your own bank.",
  },
]

export function HowItWorks() {
  return (
    <section id="ap-loop" className="bg-white py-14 md:py-22">
      <div className="mx-auto max-w-6xl px-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[0.78rem] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> The AP loop
        </span>
        <h2 className="mt-4 font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.1] tracking-[-0.03em] text-slate-900">
          From inbox to payment file
        </h2>
        <p className="mt-3 max-w-[46rem] text-[1.02rem] leading-[1.6] text-slate-600">
          Your part is these three. DocuBite does the rest.
        </p>
        <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
          {ACTS.map((act) => (
            <div key={act.n} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
              <span className="font-display text-[0.9rem] font-bold text-emerald-700">{act.n}</span>
              <h3 className="mt-2 font-display text-xl font-bold tracking-[-0.02em] text-slate-900">{act.title}</h3>
              <div className="mt-1 text-[0.78rem] font-semibold uppercase tracking-wide text-emerald-700">{act.steps}</div>
              <p className="mt-2.5 text-pretty text-[0.94rem] leading-[1.58] text-slate-600">{act.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <p className="max-w-[31rem] text-pretty text-sm leading-[1.6] text-slate-600">
            <strong className="text-slate-900">Not on the list, on purpose:</strong> DocuBite does not move money, issue cards, or hold funds. You still pay from your own bank; we hand it a ready-to-pay file. Payment execution stays outside DocuBite.
          </p>
        </div>
        <Link href="/product" className="mt-6 inline-flex items-center font-semibold text-emerald-800 underline decoration-emerald-200 underline-offset-4 hover:decoration-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
          See how it works end to end <ArrowRight aria-hidden className="ml-1 h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

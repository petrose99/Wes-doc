import { CheckCircle2, ClipboardCheck, FileSearch, GitCompare, Landmark, Mail, Send, ShieldAlert } from "lucide-react"

const STEPS: { title: string; text: string; icon: typeof Mail }[] = [
  { title: "Capture", text: "Invoices in by email, upload, or API. Duplicates are caught before they cost you an hour.", icon: Mail },
  { title: "Code", text: "Vendor, dates, totals, tax and line items into typed fields — with per-field confidence and source citations.", icon: FileSearch },
  { title: "Check", text: "Fraud checks other tools miss: changed bank details, split invoices, suspicious resubmissions.", icon: ShieldAlert },
  { title: "Match", text: "Bills matched to their purchase order and — where you use them — the goods-received note. Any mismatch is surfaced with the exact numbers side by side.", icon: GitCompare },
  { title: "Approve", text: "Named approvers, amount thresholds, and a review trail for every decision. Your controls, not ours.", icon: ClipboardCheck },
  { title: "Sync", text: "Bills pushed to your accounting tool — QuickBooks, Xero and more — and a retry never posts twice.", icon: Landmark },
  { title: "Pay-ready", text: "One click assembles a bank-ready payment file with per-supplier remittance advice. You upload it to your bank.", icon: Send },
]

/** WP-AP2: the AP loop visualization. Sits between HowItWorks and the deeper-dive sections so a
 * reader who came for AP sees the whole shape before scrolling into any one step. The final step
 * is deliberately named "pay-ready" — DocuBite prepares, the bank executes. */
export function ApLoop() {
  return (
    <section id="ap-loop" className="bg-white py-14 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mb-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-3.5 py-1.5 text-[0.78rem] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> The AP loop
          </span>
          <h2 className="mt-4 font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.1] tracking-[-0.03em] text-stone-900">
            Seven steps, in order. So you never leave DocuBite mid-invoice.
          </h2>
          <p className="mt-3 text-[1.02rem] leading-[1.6] text-stone-600">
            The AP loop unfolded — from the bill arriving to the payment file leaving. Deterministic where it matters (checks, matching, approvals) and AI-assisted where it&apos;s useful (extraction, coding). No black boxes.
          </p>
        </div>
        {/* Horizontal rail: seven step cards connected by a continuous line. On desktop the line runs
         * behind the numbered pips so the "loop" reads as one shape, not seven detached tiles.
         * On narrow viewports we fall back to a stacked vertical rail with the connector on the left. */}
        <ol className="relative grid gap-4 lg:hidden">
          <span aria-hidden className="absolute left-4 top-4 bottom-4 w-px bg-cream-200" />
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative rounded-2xl border border-cream-200 bg-cream-50/40 p-5 pl-14">
              <span className="absolute left-1.5 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white ring-4 ring-white">{i + 1}</span>
              <div className="flex items-center justify-between">
                <div className="font-display text-lg font-bold tracking-tight text-stone-900">{step.title}</div>
                <step.icon className="h-5 w-5 text-stone-400" />
              </div>
              <p className="mt-1.5 text-sm leading-[1.55] text-stone-600">{step.text}</p>
            </li>
          ))}
        </ol>
        <ol className="relative hidden grid-cols-7 gap-3 lg:grid">
          <span aria-hidden className="absolute left-0 right-0 top-4 h-px bg-cream-200" />
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative flex flex-col items-stretch">
              <span className="relative z-10 mx-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white ring-4 ring-white">{i + 1}</span>
              <div className="mt-3 flex-1 rounded-2xl border border-cream-200 bg-cream-50/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display text-[1.02rem] font-bold tracking-tight text-stone-900">{step.title}</div>
                  <step.icon className="h-4 w-4 shrink-0 text-stone-400" />
                </div>
                <p className="mt-1.5 text-[0.82rem] leading-[1.5] text-stone-600">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
          <strong className="text-stone-900">Not on the list, on purpose:</strong> DocuBite does not move money, does not issue cards, and does not hold funds. You still pay from your own bank — we just hand it a ready-to-pay file. That means no switching banks, no new payment licence to trust, and DocuBite works the same across South Africa, Lesotho, Namibia and Eswatini.
        </p>
      </div>
    </section>
  )
}

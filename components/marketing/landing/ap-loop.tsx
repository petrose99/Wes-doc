import { CheckCircle2, ClipboardCheck, FileSearch, GitCompare, Landmark, Mail, Send, ShieldAlert } from "lucide-react"

const STEPS: { title: string; text: string; icon: typeof Mail }[] = [
  { title: "Capture", text: "Invoices in by email, upload, or API. Duplicates are caught before they cost you an hour.", icon: Mail },
  { title: "Code", text: "Vendor, dates, totals, tax and line items into typed fields — with per-field confidence and source citations.", icon: FileSearch },
  { title: "Check", text: "Fraud checks that other tools miss: a supplier's bank details changed, a split invoice under an approval floor, a suspicious resubmission.", icon: ShieldAlert },
  { title: "Match", text: "2-way and 3-way matching against POs and receipts. Discrepancies surface with the deltas spelled out — nothing to hunt for.", icon: GitCompare },
  { title: "Approve", text: "Named approvers, amount thresholds, and a review trail for every decision. Your controls, not ours.", icon: ClipboardCheck },
  { title: "Sync", text: "Bills pushed to QuickBooks, Xero, or Bigcapital as bills, with idempotency so a retry never duplicates.", icon: Landmark },
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
            Seven steps. All of them. So you never leave DocuBite mid-invoice.
          </h2>
          <p className="mt-3 text-[1.02rem] leading-[1.6] text-stone-600">
            The AI accounts-payable loop, from the bill arriving to the payment file leaving. Every step is deterministic where it matters (checks, matching, approvals) and AI-assisted where it&apos;s useful (extraction, coding). No black boxes and no half-features.
          </p>
        </div>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative rounded-2xl border border-cream-200 bg-cream-50/40 p-5">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">{i + 1}</span>
                <step.icon className="h-5 w-5 text-stone-400" />
              </div>
              <div className="mt-3 font-display text-lg font-bold tracking-tight text-stone-900">{step.title}</div>
              <p className="mt-1.5 text-sm leading-[1.55] text-stone-600">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
          <strong className="text-stone-900">Not on the list, on purpose:</strong> DocuBite does not move money, does not issue cards, and does not hold funds. Payment execution stays on your bank&apos;s rails. That keeps DocuBite outside every payment-license perimeter and lets us serve customers across South Africa, Lesotho, Namibia and Eswatini without asking anyone to switch banks.
        </p>
      </div>
    </section>
  )
}

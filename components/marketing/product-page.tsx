import { Extraction } from "@/components/marketing/landing/extraction"
import { FolderChecks } from "@/components/marketing/landing/folder-checks"
import { Sheets } from "@/components/marketing/landing/sheets"
import { Reveal } from "@/components/marketing/reveal"
import { ArrowRight, BookOpenCheck, Check, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react"
import Link from "next/link"

export type ProductFeatureSlug = "extraction" | "controls" | "close" | "data-health" | "integrations"

type ProductFeature = {
  slug: ProductFeatureSlug
  title: string
  group: string
  summary: string
  claim: string
  proof: string[]
  limit: string[]
  attention: {
    label: string
    message: string
    action: string
  }
}

export const PRODUCT_FEATURES: ProductFeature[] = [
  {
    slug: "extraction",
    title: "Document extraction",
    group: "Read & review",
    summary: "Turn supported PDFs and images into reviewable rows with confidence and source provenance.",
    claim: "Get the fields your books need, with the uncertain ones raised instead of quietly guessed.",
    proof: [
      "PDF, JPEG, PNG, WebP and HEIC files can enter the same intake flow.",
      "Line items, tax, totals and custom fields return as structured values.",
      "Every extracted value keeps a pointer to its source document and page.",
    ],
    limit: [
      "Confidence is a review signal, not a correctness guarantee.",
      "Coverage depends on the jurisdiction pack registered for the workflow.",
      "The workspace stores up to 200 MB of documents before an upload is accepted.",
    ],
    attention: {
      label: "Review required",
      message: "Purchase order · 61% confidence · INV-4471.pdf, page 1",
      action: "Open the source",
    },
  },
  {
    slug: "controls",
    title: "Controls & fraud",
    group: "Read & review",
    summary: "Catch anomalies and enforce explainable gates before risky workflow steps.",
    claim: "Your rules stay close to the document, the evidence and the person who must decide.",
    proof: [
      "Duplicate, missing-evidence and balance checks explain why a document needs attention.",
      "Hard gates can stop risky work before it reaches a ledger or approval step.",
      "Workspace-authored safe expressions let teams add their own soft gates without hiding the rule.",
    ],
    limit: [
      "A check surfaces evidence; it does not make an approval decision for your team.",
      "A blocked item stays visible until it is resolved or an authorised override is recorded.",
      "Fraud checks identify signals for review and do not promise that every fraudulent document is found.",
    ],
    attention: {
      label: "Blocked check",
      message: "Bank-detail change freeze · supplier details changed after last approval",
      action: "Review the evidence",
    },
  },
  {
    slug: "close",
    title: "Close the books",
    group: "Close with confidence",
    summary: "Coordinate close work with gated period transitions and unposted accrual drafts.",
    claim: "The close is a working paper with a clear state, not a checklist you have to reconstruct from email.",
    proof: [
      "Monthly close items cover bank reconciliation, AP ageing, accruals and VAT workpapers where relevant.",
      "Period lock is refused while an open hard gate still affects the workspace bills.",
      "Unposted bill accruals produce draft journals with reversals that never post automatically.",
    ],
    limit: [
      "A lock is a server-confirmed financial action; it does not complete optimistically.",
      "Soft-gate overrides require a recorded reason and remain part of the audit trail.",
      "DocuBite prepares the work and file; it does not move money or pay a supplier.",
    ],
    attention: {
      label: "Period lock blocked",
      message: "1 hard gate is still open against this workspace's bills",
      action: "Open the close checklist",
    },
  },
  {
    slug: "data-health",
    title: "Data health",
    group: "Close with confidence",
    summary: "Surface scored pipeline, ledger and tax drift before reconciliation problems grow.",
    claim: "See where the data is losing shape while there is still time to correct the source.",
    proof: [
      "27 checks score pipeline, ledger and tax hygiene across the workspace.",
      "The 0–100 score makes extraction-confidence drift and chart-of-accounts drift visible together.",
      "Degraded checks keep their reason and freshness visible instead of presenting stale data as healthy.",
    ],
    limit: [
      "A score helps prioritise investigation; it does not certify the books or replace reconciliation.",
      "A stale dependency lowers confidence in the score until the source sync catches up.",
      "The checks describe the data DocuBite can see, not every system outside the workspace.",
    ],
    attention: {
      label: "Degraded check",
      message: "Ledger sync is 25 hours old · score held until the next confirmed sync",
      action: "Review the check",
    },
  },
  {
    slug: "integrations",
    title: "Integrations & API",
    group: "Connect & extend",
    summary: "Send reviewed data to connected accounting systems and external systems through documented interfaces.",
    claim: "The handoff keeps its review state, destination and source trail when it leaves the inbox.",
    proof: [
      "Reviewed work can land in DocuBite's built-in double-entry ledger.",
      "QuickBooks Online and Xero are the connected external accounting systems today.",
      "Worksheets, API keys and webhooks give teams a documented way to work with the data they own.",
    ],
    limit: [
      "Roadmap integrations are named as planned text, not presented as connected capability.",
      "A failed sync stays visible and needs a retry or reconnection before it can complete.",
      "The source record remains in DocuBite; a destination does not replace the audit trail.",
    ],
    attention: {
      label: "Sync needs attention",
      message: "Xero connection expired · the reviewed batch is waiting to be retried",
      action: "Reconnect and retry",
    },
  },
]

export function getProductFeature(slug: string) {
  return PRODUCT_FEATURES.find((feature) => feature.slug === slug)
}

function ProductCta({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${compact ? "mt-7" : "mt-9"}`}>
      <Link
        href="/signup"
        className="group inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-emerald-700 px-6.5 text-[0.98rem] font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,.08),0_10px_26px_rgba(4,120,87,.2)] transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        Create an account <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <Link
        href="/demo"
        className="group inline-flex h-12 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-6 text-[0.98rem] font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        Request a demo <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}

export function ProductOverview() {
  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <div className="max-w-3xl">
            <h1 className="text-balance font-display text-[clamp(2.6rem,5.8vw,5.2rem)] font-extrabold leading-[.98] tracking-[-.05em] text-slate-950">
              See the mechanism behind the paperwork.
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-[1.12rem] leading-[1.65] text-slate-600">
              DocuBite turns supported documents into reviewable rows, keeps every exception visible, and carries approved work toward your ledger. Explore the parts that make the workflow explainable.
            </p>
            <ProductCta />
          </div>
        </div>
      </section>

      <section id="capabilities" className="border-b border-slate-200 bg-white py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[1.2fr_.8fr] lg:gap-20">
          <div>
            <h2 className="max-w-2xl text-balance font-display text-[clamp(2rem,3.5vw,3rem)] font-bold leading-[1.04] tracking-[-.04em] text-slate-950">
              Follow one piece of work all the way through.
            </h2>
            <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-slate-600">
              Start with the capability closest to the question you are trying to answer. Each page shows the mechanism, the evidence it keeps, and the point where a person still needs to decide.
            </p>
            <nav aria-label="Product capabilities" className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
              {PRODUCT_FEATURES.map((feature) => (
                <Link
                  key={feature.slug}
                  href={`/product/${feature.slug}`}
                  className="group flex items-start gap-6 py-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-emerald-700">{feature.group}</span>
                    <span className="mt-1 block font-display text-xl font-bold tracking-[-.02em] text-slate-950">{feature.title}</span>
                    <span className="mt-2 block max-w-xl text-pretty text-sm leading-6 text-slate-600">{feature.summary}</span>
                  </span>
                  <ArrowRight aria-hidden className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-emerald-700" />
                </Link>
              ))}
            </nav>
          </div>

          <aside className="self-start border-y border-slate-200 py-6 lg:mt-20">
            <h3 className="font-display text-xl font-bold tracking-[-.02em] text-slate-950">The workflow stays visible</h3>
            <ol className="mt-5 divide-y divide-slate-200">
              {["Capture supported files", "Review fields and evidence", "Apply checks and gates", "Close the period", "Connect the outcome"].map((step, index) => (
                <li key={step} className="flex items-center gap-4 py-3 text-sm text-slate-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="mt-5 text-sm leading-6 text-slate-600">The system moves routine work forward. People keep the decisions that need context.</p>
          </aside>
        </div>
      </section>

      <section className="bg-slate-50 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <h2 className="font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-.03em] text-slate-950">Useful detail, with the limits in view.</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">A public explanation is only useful when it also says where the product stops.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["Reviewable, not infallible", "Confidence and source provenance stay attached to the work so a person can verify what matters."],
              ["Connected, not universal", "Built-in ledger, QuickBooks Online and Xero are live destinations today; roadmap systems are labelled as planned."],
              ["Account creation, not a trial", "Create an account to explore the workspace. No billing promise is hidden in the action."],
            ].map(([title, body]) => (
              <article key={title} className="border-t-2 border-slate-900 pt-5">
                <h3 className="font-display text-xl font-bold tracking-[-.02em] text-slate-950">{title}</h3>
                <p className="mt-2.5 text-sm leading-6 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

function FeatureMock({ slug }: { slug: ProductFeatureSlug }) {
  if (slug === "extraction") return <Extraction />
  if (slug === "controls") return <FolderChecks />
  if (slug === "integrations") return <Sheets />
  if (slug === "close") return <CloseMock />
  return <DataHealthMock />
}

export function ProductFeaturePage({ feature }: { feature: ProductFeature }) {
  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">
          <Link href="/product" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 underline decoration-emerald-200 underline-offset-4 hover:decoration-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
            <ArrowRight aria-hidden className="h-4 w-4 rotate-180" /> Product overview
          </Link>
          <div className="mt-10 max-w-3xl">
            <h1 className="text-balance font-display text-[clamp(2.55rem,5.4vw,4.8rem)] font-extrabold leading-[.98] tracking-[-.05em] text-slate-950">{feature.title}</h1>
            <p className="mt-6 max-w-2xl text-pretty text-[1.12rem] leading-[1.65] text-slate-600">{feature.summary}</p>
            <ProductCta compact />
          </div>
        </div>
      </section>

      <FeatureMock slug={feature.slug} />

      <Reveal as="section" className="border-y border-slate-200 bg-white py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[.72fr_1.28fr] lg:gap-20">
          <div>
            <h2 className="text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-.03em] text-slate-950">{feature.claim}</h2>
          </div>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {feature.proof.map((item) => (
              <li key={item} className="flex gap-3 py-4 text-base leading-7 text-slate-700">
                <Check aria-hidden className="mt-1 h-5 w-5 shrink-0 text-emerald-700" strokeWidth={2.4} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      <section className="border-b border-slate-200 bg-slate-50 py-14 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-[.8fr_1.2fr] md:gap-16">
          <div>
            <h2 className="font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold leading-[1.08] tracking-[-.03em] text-slate-950">The state you can act on</h2>
            <p className="mt-3 max-w-md text-base leading-7 text-slate-600">The important exception is part of the product explanation, not hidden behind a perfect-path demo.</p>
          </div>
          <div className="border-y border-slate-300 bg-white px-5 py-5 md:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <CircleAlert aria-hidden className="h-5 w-5 text-amber-700" />
              <span className="text-sm font-bold text-slate-950">{feature.attention.label}</span>
            </div>
            <p className="mt-3 text-base leading-7 text-slate-700">{feature.attention.message}</p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-800">
              Next: {feature.attention.action}
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white py-14 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-[.8fr_1.2fr] md:gap-16">
          <div>
            <h2 className="font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold leading-[1.08] tracking-[-.03em] text-slate-950">Where it stops</h2>
            <p className="mt-3 max-w-md text-base leading-7 text-slate-600">Knowing the boundary is part of deciding whether this belongs in your workflow.</p>
          </div>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {feature.limit.map((item) => (
              <li key={item} className="flex gap-3 py-4 text-base leading-7 text-slate-700">
                <ShieldCheck aria-hidden className="mt-1 h-5 w-5 shrink-0 text-slate-600" strokeWidth={2} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-balance font-display text-[clamp(2rem,3.8vw,3.2rem)] font-extrabold leading-[1.02] tracking-[-.04em] text-slate-950">Make the next document easier to explain.</h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-7 text-slate-600">Create an account to explore the workspace. When a real setup needs a closer conversation, request a demo with the mechanism in view.</p>
          <ProductCta compact />
        </div>
      </section>
    </>
  )
}

function CloseMock() {
  const rows = [
    ["Bank reconciliation", "Signed", "emerald"],
    ["AP ageing", "Signed", "emerald"],
    ["Unposted bill accruals", "Draft ready", "amber"],
    ["VAT workpaper", "Open hard gate", "red"],
  ] as const

  return (
    <section className="border-y border-slate-200 bg-white py-14 md:py-22">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-8 px-5 md:gap-13">
        <div className="min-w-0 flex-1 basis-[440px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
              <BookOpenCheck aria-hidden className="h-5 w-5 text-emerald-700" />
              <span className="font-display text-base font-bold text-slate-950">March 2026 close</span>
              <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">Open</span>
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map(([label, status, tone]) => (
                <div key={label} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-900">{label}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone === "emerald" ? "bg-emerald-50 text-emerald-800" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"}`}>{status}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-red-100 bg-red-50 px-5 py-4 text-sm text-red-900">
              <CircleAlert aria-hidden className="h-4 w-4 shrink-0 text-red-700" />
              <span className="min-w-0 flex-1">Lock blocked: 1 hard gate is open.</span>
              <span className="font-bold underline underline-offset-4">Open checklist</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <span className="text-xs leading-5 text-slate-600">Draft accrual journals are not posted automatically.</span>
              <span className="rounded-[10px] bg-slate-200 px-4 py-2 text-sm font-bold text-slate-500">Lock period</span>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 basis-[340px]">
          <h2 className="text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-.03em] text-slate-950">A close with a state, not a spreadsheet scavenger hunt</h2>
          <p className="mt-4 max-w-[31rem] text-pretty text-[1.02rem] leading-[1.62] text-slate-600">The checklist gathers working papers, sign-off and period-lock rules in one place. The state above is the point: the system tells you why the period cannot lock and what still needs a person.</p>
        </div>
      </div>
    </section>
  )
}

function DataHealthMock() {
  const checks = [
    ["Pipeline", "94", "12 checks clear"],
    ["Ledger", "68", "sync is stale"],
    ["Tax", "83", "2 checks need review"],
  ] as const

  return (
    <section className="border-y border-slate-200 bg-white py-14 md:py-22">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-8 px-5 md:gap-13">
        <div className="min-w-0 flex-1 basis-[340px]">
          <h2 className="text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-.03em] text-slate-950">Find the drift before the close finds it for you</h2>
          <p className="mt-4 max-w-[31rem] text-pretty text-[1.02rem] leading-[1.62] text-slate-600">Data Health turns pipeline, ledger and tax hygiene into a score you can investigate. A stale or degraded dependency is part of the result, not silently averaged away.</p>
        </div>
        <div className="min-w-0 flex-1 basis-[440px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
            <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.08em] text-slate-600">Workspace data health</p>
                <p className="mt-1 font-display text-3xl font-bold tracking-[-.03em] text-slate-950">78 <span className="text-base font-semibold text-slate-600">/ 100</span></p>
              </div>
              <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">Needs review</span>
            </div>
            <div className="divide-y divide-slate-100">
              {checks.map(([label, score, detail]) => (
                <div key={label} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{label}</span>
                  <span className="text-sm font-bold tabular-nums text-slate-900">{score}</span>
                  <span className="w-full text-xs text-slate-600 sm:w-auto">{detail}</span>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-3 border-t border-amber-100 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
              <RefreshCw aria-hidden className="mt-1 h-4 w-4 shrink-0 text-amber-700" />
              <span><strong>Degraded check:</strong> ledger sync is 25 hours old. The score stays marked until the next confirmed sync.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

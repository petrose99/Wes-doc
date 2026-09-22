/** Extraction — the thing the product actually is, given the room to say so.
 *
 * Deliberately not Provenance's story (where a value came from) or FolderChecks' (what was wrong
 * across a batch). This one answers "what do I get back": every field, the line items under them,
 * and a confidence on each, with the uncertain ones raised rather than quietly guessed.
 *
 * Static. The confidence bars are markup, not animation — this section is read, not watched. */

import { MOCK_TYPE } from "@/components/marketing/landing/_lib/mock-scale"

const FIELDS: { label: string; value: string; confidence: number; flagged?: boolean }[] = [
  { label: "Supplier", value: "Northwind Trading", confidence: 0.99 },
  { label: "Invoice number", value: "INV-4471", confidence: 0.98 },
  { label: "Issue date", value: "14 Mar 2026", confidence: 0.97 },
  { label: "VAT at 20%", value: "£412.60", confidence: 0.96 },
  { label: "Total due", value: "£2,475.60", confidence: 0.99 },
  { label: "Purchase order", value: "PO-2291", confidence: 0.61, flagged: true },
]

const LINES = [
  { description: "Kiln-dried oak, 40 × 2.4m", qty: "40", amount: "£1,684.00" },
  { description: "Delivery, next day", qty: "1", amount: "£379.00" },
]

const POINTS = [
  {
    title: "PDFs and photos are valid input",
    body: "Upload PDF, JPEG, PNG, WebP or HEIC files. EXIF rotation is applied to images before each page is parsed to text. A PDF holding six documents becomes six records.",
  },
  {
    title: "Line items, not only the header",
    body: "What was bought, how many, at what price, under which tax rate. The detail your books need survives the read.",
  },
  {
    title: "Your document types, your fields",
    body: "Define what an invoice means in your business, or a haulage note, or a lab report. Extraction follows the worksheet you set, not a fixed template.",
  },
]

export function Extraction() {
  return (
    <section id="extraction" className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-[44rem]">
          <h2 className="text-balance font-display text-[clamp(2.05rem,3.4vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.035em] text-slate-950">
            Every field off the page, and how sure it is of each one
          </h2>
          <p className="mt-5 max-w-[36rem] text-pretty text-[1.06rem] leading-[1.62] text-slate-600">
            This is the part everything else rests on. A document goes in and comes back as fields you can
            work with: supplier, dates, tax, totals, and the line items underneath. Each carries a confidence.
            What it is sure of goes straight through. What it is not is raised for you, not guessed at.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-8 md:gap-12">
          <div className="min-w-0 flex-1 basis-[440px]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_18px_44px_rgba(28,25,23,.09)]">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                <span className={`min-w-0 break-words font-display font-bold text-slate-900 ${MOCK_TYPE.evidence}`}>INV-4471.pdf</span>
                <span className={`shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-700 ${MOCK_TYPE.supporting}`}>Invoice</span>
              </div>

              <dl className="divide-y divide-slate-50">
                {FIELDS.map((field) => (
                  <div key={field.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_auto]">
                    <dt className={`min-w-0 break-words text-slate-600 ${MOCK_TYPE.evidence}`}>{field.label}</dt>
                    <dd className={`min-w-0 break-words font-semibold ${MOCK_TYPE.evidence} ${field.flagged ? "text-amber-800" : "text-slate-900"}`}>{field.value}</dd>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className={`block h-full rounded-full ${field.flagged ? "bg-amber-500" : "bg-emerald-600"}`}
                          style={{ width: `${Math.round(field.confidence * 100)}%` }}
                        />
                      </span>
                      <span className={`w-8 shrink-0 text-right font-semibold tabular-nums text-slate-600 ${MOCK_TYPE.supporting}`}>
                        {Math.round(field.confidence * 100)}
                      </span>
                    </div>
                  </div>
                ))}
              </dl>

              <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                <p className={`font-semibold text-slate-600 ${MOCK_TYPE.supporting}`}>Line items</p>
                {LINES.map((line) => (
                  <div key={line.description} className={`mt-1.5 flex flex-wrap items-baseline justify-between gap-3 text-slate-700 ${MOCK_TYPE.evidence}`}>
                    <span className="min-w-0 break-words">{line.description}</span>
                    <span className="shrink-0 tabular-nums text-slate-600">× {line.qty}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">{line.amount}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2.5 border-t border-amber-100 bg-amber-50/70 px-5 py-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                <p className={`max-w-[27rem] text-pretty text-amber-900 ${MOCK_TYPE.evidence}`}>
                  The purchase order number was hard to read. It is waiting for you rather than sitting in your
                  books at 61% sure.
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 basis-[320px]">
            <dl className="divide-y divide-slate-200 border-t border-slate-200">
              {POINTS.map((point) => (
                <div key={point.title} className="py-4">
                  <dt className="font-display text-[1.02rem] font-bold tracking-[-0.01em] text-slate-900">{point.title}</dt>
                  <dd className="mt-1.5 text-pretty text-[0.94rem] leading-[1.58] text-slate-600">{point.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}

import { Paperclip } from "lucide-react"

/** Inbound email as an intake channel. Static and server-rendered like the Hero: the mail card is
 * decorative and reacts to nothing, so it stays plain markup rather than shipping a bundle.
 *
 * Every claim here is a behaviour in models/inbound-email.ts — the per-workspace address token,
 * the sender allowlist, zip expansion, portal-link fetching, forwarded-sender attribution, and the
 * body-rendered-to-PDF fallback. Nothing aspirational. */

const FACTS = [
  {
    title: "Only the senders you allow",
    body: "Mail from anyone else is refused and recorded, so a stray newsletter never becomes a document you have to delete.",
  },
  {
    title: "Attachments, zips and portal links",
    body: "Archives are unpacked and supplier-portal links are followed to the PDF behind them. Signature images are left alone.",
  },
  {
    title: "The email itself can be the bill",
    body: "When there is nothing attached but the message reads like an invoice, the body is rendered to a PDF and read like any other document.",
  },
  {
    title: "Forwards keep the real sender",
    body: "Forward a supplier’s mail and the document is attributed to the supplier, not to whoever passed it on. Re-sending the same attachment never makes a second copy.",
  },
]

export function EmailIntake() {
  return (
    <section id="email" className="border-y border-cream-200 bg-white py-14 md:py-22">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-8 px-5 md:gap-13">
        <div className="min-w-0 flex-1 basis-[420px]">
          <span className="text-[0.74rem] font-bold uppercase tracking-[.08em] text-emerald-700">Email intake</span>
          <h2 className="mt-3 text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-stone-950">
            Forward it in. It lands in the same queue.
          </h2>
          <p className="mt-4 max-w-[38rem] text-pretty text-[1.02rem] leading-[1.62] text-stone-600">
            Every workspace gets its own address. Forward a supplier&rsquo;s invoice from your phone, or give the
            address to the suppliers themselves and let the bills arrive on their own. What lands is read,
            checked and queued exactly like a file you dragged in — same pipeline, same flags, same review.
          </p>
          <dl className="mt-7 divide-y divide-cream-200 border-t border-cream-200">
            {FACTS.map((fact) => (
              <div key={fact.title} className="py-3.5">
                <dt className="text-[0.95rem] font-bold text-stone-900">{fact.title}</dt>
                <dd className="mt-1 text-pretty text-[0.92rem] leading-[1.58] text-stone-600">{fact.body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0 flex-1 basis-[400px]">
          <div className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,.04),0_14px_36px_rgba(28,25,23,.07)]">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.78rem]">
                <span className="font-semibold text-slate-400">From</span>
                <span className="font-semibold text-slate-900">billing@northwind.co.uk</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.78rem]">
                <span className="font-semibold text-slate-400">To</span>
                <span className="break-all font-mono text-[0.74rem] text-emerald-800">acme-9f3c@inbound.docubite.app</span>
              </div>
              <p className="mt-2.5 font-display text-[0.98rem] font-bold text-slate-900">March invoice, plus the statement</p>
            </div>

            <div className="flex flex-col gap-1.5 px-5 py-4">
              {["INV-4471.pdf", "statement-mar.pdf"].map((name) => (
                <div key={name} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-[0.78rem] text-slate-700">
                  <Paperclip aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{name}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-emerald-100 bg-emerald-50/70 px-5 py-3.5">
              <p className="text-[0.82rem] font-semibold text-emerald-900">2 documents added to Extraction</p>
              <p className="mt-0.5 text-[0.76rem] text-emerald-800">
                Sender allowed. Northwind Trading recognised from 10 previous invoices.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

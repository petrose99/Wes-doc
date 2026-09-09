import { Mail, Upload } from "lucide-react"

/** Both ways documents arrive, in one band. Upload and email are the same fact — how paperwork
 * gets in — so they share a strip rather than each claiming a screen; the page's space belongs to
 * what happens after. Static: nothing here reacts to anything.
 *
 * The email claims are behaviours in models/inbound-email.ts: a per-workspace address token, a
 * sender allowlist, zip expansion and portal-link fetching, forwarded-sender attribution, and the
 * body-rendered-to-PDF fallback when the mail itself is the bill. */
export function Intake() {
  return (
    <section id="intake" className="border-y border-cream-200 bg-white py-9 md:py-11">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid gap-6 md:grid-cols-2 md:gap-10">
          <div className="flex gap-3.5">
            <Upload aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" strokeWidth={2} />
            <div className="min-w-0">
              <h3 className="font-display text-[1.05rem] font-bold tracking-[-0.02em] text-stone-900">Drop in a file or a whole folder</h3>
              <p className="mt-1 text-pretty text-[0.9rem] leading-[1.55] text-stone-600">
                Mixed PDFs, phone photos and scans together. A PDF holding several documents is split into
                separate records.
              </p>
            </div>
          </div>

          <div className="flex gap-3.5 md:border-l md:border-cream-200 md:pl-10">
            <Mail aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" strokeWidth={2} />
            <div className="min-w-0">
              <h3 className="font-display text-[1.05rem] font-bold tracking-[-0.02em] text-stone-900">Or email it to your workspace</h3>
              <p className="mt-1 text-pretty text-[0.9rem] leading-[1.55] text-stone-600">
                Forward a bill, or give the address to suppliers and let them arrive on their own. Only senders
                you allow get through.
              </p>
              <p className="mt-2 inline-flex max-w-full items-center rounded-md border border-cream-200 bg-cream-50 px-2.5 py-1">
                <span className="truncate font-mono text-[0.74rem] text-emerald-800">acme-9f3c@inbound.docubite.app</span>
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 border-t border-cream-200 pt-4 text-pretty text-[0.86rem] leading-[1.55] text-stone-500">
          Either way it is the same pipeline after that — the same reading, the same checks, the same review
          queue. Zips are unpacked, supplier-portal links are followed, and an email that <em>is</em> the bill,
          with nothing attached, is read from its own body.
        </p>
      </div>
    </section>
  )
}

import type { ReactNode } from "react"
import Link from "next/link"

/** #252: the Admin area's page furniture — Controls' Panel/Ledger grammar is the admin grammar
 * (#231 Q21), so this file only adds what Admin needs on top: the page head, the read-only band
 * a member sees instead of a 404, and the phone note. No Card anywhere in Admin. */

/** One page: the section name as the display h1, one intro sentence, then panels at a 40px
 * rhythm. `max-w` is the same on every Admin page so the column never jumps between sections
 * (the incumbent jumped 128px between Settings and Controls). */
export function AdminPage({ title, intro, aside, children, phoneNote = true }: {
  title: string
  intro?: ReactNode
  /** A control that belongs beside the title — the Fields page's document-type switcher. */
  aside?: ReactNode
  children: ReactNode
  /** Off for the Account pages, which are not desktop-only. */
  phoneNote?: boolean
}) {
  return <div className="w-full max-w-[880px] px-5 py-6 md:px-8 md:py-8">
    {/* The company name below md is the Admin layout's, above this frame. */}
    {phoneNote && <PhoneNote />}
    <header className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="font-display text-[26px] leading-none font-semibold tracking-tight text-slate-900">{title}</h1>
        {aside}
      </div>
      {intro && <p className="mt-2.5 max-w-[60ch] text-sm leading-relaxed text-slate-600">{intro}</p>}
    </header>
    <div className="space-y-10">{children}</div>
  </div>
}

/** #231 Q19: a member opening an owner-only page sees the page, cannot change it, and is told
 * who can — never `notFound()`. Names are read from the membership list so the recovery is a
 * person, not a role. */
export function ReadOnlyBand({ owners, children }: { owners: string[]; /** #271: an alternative sentence in the same band (Admin's "email is not configured" line). */ children?: ReactNode }) {
  const named = owners.filter(Boolean)
  return <p role="status" className="mb-8 max-w-[60ch] rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
    {children ?? <>
      Only an owner can change this.{" "}
      {named.length ? <>Ask an owner: <span className="font-medium">{named.join(", ")}</span>.</> : "Ask an owner."}
    </>}
  </p>
}

/** #231 Q18: Admin is a desktop area. A deep link on a phone still resolves under this one line;
 * the controls stay live (an owner in a pinch can still act), the save bar sits above the tab
 * bar, and the note says where the work belongs. */
export function PhoneNote() {
  return <p className="mb-6 rounded-md border border-hairline bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-700 md:hidden">
    Admin is a desktop area. Changes made here on a phone still save; the full tables are easier on a computer.
  </p>
}

/** A module the page depends on is off: one sentence and the way to turn it on, not a 404. */
export function ModuleOff({ what, href }: { what: string; href: string }) {
  return <p className="text-sm text-slate-600">
    {what} is not one of this workspace&rsquo;s modules.{" "}
    <Link href={href} className="font-medium text-emerald-700 underline-offset-2 hover:underline">See what&rsquo;s on</Link>
  </p>
}

/** A settings-page fact stated once, beside the control it explains. Sentence-first, no pill. */
export function Consequence({ children }: { children: ReactNode }) {
  return <p className="max-w-[60ch] text-[13px] leading-relaxed text-slate-600">{children}</p>
}

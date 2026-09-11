import type { ReactNode } from "react"
import Link from "next/link"

import { AutomationTabs, type AutomationTab } from "@/components/automation/automation-tabs"

/** Shared furniture for the four Automation tabs.
 *
 * The section is read as a ledger rather than a dashboard: one figure per screen earns display
 * size, everything else is a ruled row with its number right-aligned in tabular figures. That is
 * why there is no Card-per-fact here — a panel is a rule and a heading, not a shadowed box, so a
 * screen with nine facts on it still reads as one object instead of nine competing ones.
 *
 * Colour is meaning, not decoration: emerald says "this ran without a person", amber says "this is
 * waiting on someone", red says "this is blocked". Anything that is merely a quantity stays ink. */

export type AutomationState = "auto" | "waiting" | "blocked" | "idle"

const STATE_INK: Record<AutomationState, string> = {
  auto: "text-emerald-700",
  waiting: "text-amber-700",
  blocked: "text-red-700",
  idle: "text-slate-500",
}

const STATE_FILL: Record<AutomationState, string> = {
  auto: "bg-emerald-600",
  waiting: "bg-amber-500",
  blocked: "bg-red-500",
  idle: "bg-slate-300",
}

/** Page shell. Every tab shares one header, so the four screens stop re-announcing "Automation"
 * and the space goes to the tab's own hero instead. `status` is the one live sentence a person
 * wants before anything else: what the workspace is currently allowed to do on its own. */
export function AutomationFrame({ workspaceId, active, reviewCount, reviewEnabled, status, showSettings = true, children }: {
  workspaceId: string
  active: AutomationTab
  reviewCount: number
  reviewEnabled: boolean
  status: ReactNode
  /** Settings is an owner-only page (404s for anyone else) — pass false for a non-owner viewer
   * so the tab link doesn't render a door that slams. */
  showSettings?: boolean
  children: ReactNode
}) {
  return <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
    <header className="mb-5">
      <h1 className="font-display text-[26px] leading-none font-semibold tracking-tight text-slate-900">Controls</h1>
      <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-slate-600">{status}</p>
    </header>
    <AutomationTabs workspaceId={workspaceId} active={active} reviewCount={reviewCount} reviewEnabled={reviewEnabled} showSettings={showSettings} />
    <div className="mt-8 space-y-10">{children}</div>
  </main>
}

/** The one number a screen is opened for. Display face, oversized, with its own caption — nothing
 * else on the page is allowed to compete with it.
 *
 * `stacked` sets the caption under the numeral, for when the figure shares a row with something
 * else; `inline` sets it alongside, for when the figure is the whole row and a narrow column of
 * text would leave the right half of the screen empty. */
export function Figure({ value, caption, state = "auto", layout = "stacked" }: {
  value: string
  caption: ReactNode
  state?: AutomationState
  layout?: "stacked" | "inline"
}) {
  const numeral = <div className={`font-display text-6xl leading-none font-semibold tracking-tight tabular-nums ${STATE_INK[state]}`}>{value}</div>
  if (layout === "inline") {
    return <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
      {numeral}
      <p className="max-w-[54ch] text-sm leading-relaxed text-slate-600">{caption}</p>
    </div>
  }
  return <div>
    {numeral}
    <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-slate-600">{caption}</p>
  </div>
}

/** A funnel drawn as one object: nested fills on a shared track, widest first, so the drop from
 * each stage to the next is a single silhouette rather than three bars a reader has to compare by
 * eye. Stages must arrive widest-to-narrowest and share `total`.
 *
 * The funnel gets its own ramp rather than the state colours: every stage here is *progress*
 * toward publishing, so none of them is a warning. Reusing amber for a middle stage would say
 * "someone needs to look at this" about documents that had in fact passed everything. */
const FUNNEL_RAMP = ["bg-slate-300", "bg-emerald-300", "bg-emerald-600"]

export function Funnel({ total, stages }: {
  total: number
  /** Widest first. Rendered in order, so later (narrower) stages paint over earlier ones. */
  stages: { label: string; value: number }[]
}) {
  const pct = (n: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0)
  const fill = (i: number) => FUNNEL_RAMP[Math.min(i, FUNNEL_RAMP.length - 1)]
  return <div>
    <div className="relative h-14 overflow-hidden rounded-md bg-slate-100">
      {stages.map((stage, i) => (
        <div
          key={stage.label}
          className={`absolute inset-y-0 left-0 ${fill(i)}`}
          style={{ width: `${pct(stage.value)}%` }}
        />
      ))}
    </div>
    <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
      {stages.map((stage, i) => (
        <div key={stage.label} className="flex items-baseline gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 translate-y-px rounded-sm ${fill(i)}`} aria-hidden />
          <dt className="text-sm text-slate-600">{stage.label}</dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-900">{stage.value}</dd>
        </div>
      ))}
    </dl>
  </div>
}

/** A titled region. A rule and a heading — deliberately not a card, so several on one screen still
 * read as one page. */
export function Panel({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return <section>
    <div className="border-b border-[#e6ebf1] pb-2.5">
      <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
      {note && <p className="mt-1 max-w-[72ch] text-[13px] leading-relaxed text-slate-500">{note}</p>}
    </div>
    <div className="pt-4">{children}</div>
  </section>
}

/** Ruled rows: a label on the left, its figure right-aligned in tabular numerals, an optional
 * proportion bar underneath. This is the ledger line the whole section is built from. */
export function Ledger({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-[#f1f5f9]">{children}</div>
}

export function LedgerRow({ label, value, note, share, state = "idle", href }: {
  label: ReactNode
  value: ReactNode
  note?: ReactNode
  /** 0–1. Draws a hairline proportion bar beneath the row when given. */
  share?: number
  state?: AutomationState
  /** When given, the row's figure is what it always was but the row itself becomes a link — a
   * count like "Blocked in Review 14" is a dead end otherwise, forcing a reader who wants to see
   * those 14 documents to go hunting for them by hand. */
  href?: string
}) {
  const body = <>
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-slate-700 group-hover:text-slate-900">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${STATE_INK[state]}`}>{value}</span>
    </div>
    {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    {share !== undefined && (
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${STATE_FILL[state]}`} style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }} />
      </div>
    )}
  </>
  if (href) {
    return <Link href={href} className="group -mx-1 block rounded px-1 py-3 first:pt-0 hover:bg-slate-50">{body}</Link>
  }
  return <div className="py-3 first:pt-0">{body}</div>
}

/** State marker for table rows. Reads as a word plus a colour, never colour alone. */
export function Pill({ state, children }: { state: AutomationState; children: ReactNode }) {
  const tone = {
    auto: "bg-emerald-50 text-emerald-800",
    waiting: "bg-amber-50 text-amber-800",
    blocked: "bg-red-50 text-red-800",
    idle: "bg-slate-100 text-slate-600",
  }[state]
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${tone}`}>{children}</span>
}

/** Ledger-ruled table. Sentence-case heads, hairline rules, numbers in tabular figures. */
export function Sheet({ head, children, minWidth = 560 }: { head: ReactNode; children: ReactNode; minWidth?: number }) {
  return <div className="overflow-x-auto">
    <table className="w-full text-sm" style={{ minWidth }}>
      <thead>
        <tr className="border-b border-[#e6ebf1] text-left align-bottom">{head}</tr>
      </thead>
      <tbody className="divide-y divide-[#f1f5f9]">{children}</tbody>
    </table>
  </div>
}

export function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return <th scope="col" className={`pb-2 pr-4 text-[13px] font-medium text-slate-500 ${align === "right" ? "text-right" : ""}`}>{children}</th>
}

/** An empty state is an instruction, not an apology: it says what fills this screen. */
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-[#dbe3ec] px-6 py-10 text-center">
    <p className="text-sm font-semibold text-slate-900">{title}</p>
    <p className="mx-auto mt-1.5 max-w-[52ch] text-sm leading-relaxed text-slate-500">{children}</p>
  </div>
}

import type { ReactNode } from "react"
import { PROCESSING_STATE_LABELS, LEDGER_FACT_LABELS, type ProcessingState, type LedgerFact } from "@/lib/documents/processing-state"

export function formatMoney(amount: number, currency?: string | null): string {
  const currencyCode = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD"
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toFixed(0)} ${currency ?? ""}`.trim()
  }
}

export function formatDate(date: Date | null): string {
  if (!date) return "—"
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date)
}

/** The title cell every queue shares: the row's name on top, its file underneath. `title` is
 * usually a `ConfidenceField`-wrapped supplier. */
export function TitleCell({ title, subtitle, missingLabel }: { title: ReactNode; subtitle?: string | null; missingLabel?: string }) {
  return <span className="block min-w-0">
    <span className="block truncate text-slate-900">{title ?? <span className="text-slate-600">{missingLabel ?? "Unknown"}</span>}</span>
    {subtitle && <span className="block truncate text-xs text-slate-600">{subtitle}</span>}
  </span>
}

const PILL = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"

const STATE_PILL_TONE: Record<ProcessingState, string> = {
  cancelled: "bg-slate-200 text-slate-700",
  needs_attention: "bg-amber-100 text-amber-900",
  in_review: "bg-blue-100 text-blue-800",
  touchless: "bg-emerald-50 text-emerald-800",
  approved: "bg-emerald-100 text-emerald-800",
}

// #281: the Ledger mark's own tones, distinct from `STATE_PILL_TONE` so a `failed` mark never
// blurs into the row's own red "Needs attention" state pill (spec.md §4) — they always co-occur,
// never stand alone.
const LEDGER_PILL_TONE: Record<LedgerFact, string> = {
  posting: "bg-slate-100 text-slate-700",
  posted: "bg-emerald-100 text-emerald-800",
  failed: "bg-amber-100 text-amber-900",
  paid: "bg-slate-100 text-slate-700",
}

/** #270 spec §3 "Archived row": the Closed mark, alongside the processing pill via `StatePills`'s
 * `trailing` slot — spec §4 word is "Closed", never "Archive"/"Done" (#245 decision 11). Built
 * once here so #344 reuses it on the five typed queues' Closed rows instead of five copies (B4). */
export function ArchivedMark() {
  return <span className={`${PILL} bg-slate-100 text-slate-600`}>Closed</span>
}

/** The row's state pill, one word from `PROCESSING_STATE_LABELS` — the one vocabulary #258 built
 * so the row, the pane's Status line, the stepper and the Approval tab always agree. `state` is
 * total (always one of the five keys), so there is no fallback branch. Ledger facts (Posting… /
 * Posted / Post failed / Paid) render after, separately, because they are not processing states. */
export function StatePills({ state, ledger, openCheckCodes, cancelledReason, trailing }: {
  state: ProcessingState
  openCheckCodes?: string[]
  cancelledReason?: string | null
  /** A ledger fact key: "posting" | "posted" | "failed" | "paid" (#281 — "synced" retired, #248). */
  ledger?: LedgerFact | string | null
  trailing?: ReactNode
}) {
  const openCount = state === "needs_attention" ? openCheckCodes?.length ?? 0 : 0
  const title = state === "cancelled" ? cancelledReason ?? undefined
    : state === "needs_attention" ? (openCheckCodes?.length ? `Open checks: ${openCheckCodes.join(", ")}` : undefined)
    : undefined
  return <span className="flex flex-wrap items-center gap-1.5">
    <span className={`${PILL} ${STATE_PILL_TONE[state]}`} title={title}>
      {PROCESSING_STATE_LABELS[state]}{openCount > 0 ? ` · ${openCount}` : ""}
    </span>
    {ledger && <span className={`${PILL} ${LEDGER_PILL_TONE[ledger as LedgerFact] ?? "bg-slate-100 text-slate-700"}`}>{LEDGER_FACT_LABELS[ledger as LedgerFact] ?? ledger}</span>}
    {trailing}
  </span>
}

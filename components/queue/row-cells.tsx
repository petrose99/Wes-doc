import type { ReactNode } from "react"

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

/** The row's state pills, in CONTEXT.md's "Processing state" precedence: Cancelled, then Needs
 * attention (a check blocked it or a bulk approve held it back), then In review, then Touchless,
 * then Approved. Ledger facts (Synced / Paid) render after, separately, because they are not
 * processing states. */
export function StatePills({ cancelled, cancelledReason, needsAttention, openCheckCodes, inReview, touchless, approved, ledger, minConfidencePercent, trailing }: {
  cancelled?: boolean
  cancelledReason?: string | null
  needsAttention?: boolean
  openCheckCodes?: string[]
  inReview?: boolean
  touchless?: boolean
  approved?: boolean
  /** A ledger fact such as "synced" or "paid". */
  ledger?: string | null
  minConfidencePercent: number
  trailing?: ReactNode
}) {
  // Kept on the signature for the callers; the glyph owns both signals now (#223).
  void touchless; void minConfidencePercent
  const state = cancelled
    ? <span className={`${PILL} bg-slate-200 text-slate-700`} title={cancelledReason ?? undefined}>Cancelled</span>
    : needsAttention
      ? <span className={`${PILL} bg-amber-100 text-amber-900`} title={openCheckCodes?.length ? `Open checks: ${openCheckCodes.join(", ")}` : "Held back from a bulk approve — missing required fields or a document type."}>
        Needs attention{openCheckCodes?.length ? ` · ${openCheckCodes.length}` : ""}
      </span>
      : inReview
        ? <span className={`${PILL} bg-blue-100 text-blue-800`}>In review</span>
        // Touchless no longer renders here (#223) — the row's processing-state glyph carries it.
        : approved
            ? <span className={`${PILL} bg-emerald-100 text-emerald-800`}>Approved</span>
            : <span className={`${PILL} bg-slate-100 text-slate-700`}>Unreviewed</span>
  return <span className="flex flex-wrap items-center gap-1.5">
    {state}
    {ledger && <span className={`${PILL} bg-slate-100 text-slate-700 capitalize`}>{ledger}</span>}
    {trailing}
  </span>
}

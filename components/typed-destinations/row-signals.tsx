import type { AgingBucket } from "@/lib/bills/due-date"
import { confidenceState, type ConfidenceState } from "@/lib/documents/confidence-state"

/** Row anatomy promoted from the `prototype/dense-operator-row` branch (#182, resolved on Wayfinder
 * map #177) into production. Shared between InvoiceTable and ReceiptTable so the status glyph,
 * confidence underline, and aging badge render identically on both surfaces.
 *
 * Border colours (emerald/amber-700) were confirmed against a white/slate-50 row background at
 * >=4.5:1 and against the `bg-emerald-50` (#ecfdf5) selected-row tint, where both clear WCAG's
 * 3:1 non-text (border) contrast requirement by a wide margin — emerald-50 is a near-white tint
 * and each border shade is a dark 700. */

/** Two states, one floor, and never colour alone (#219): confident is a solid emerald rule,
 * below-threshold a dashed amber one, so the pair stays distinguishable for a colour-blind
 * operator scanning fifty rows. Vic.ai's own two-state green/amber underline, plus the style
 * difference `PRODUCT.md`'s "no color-only state" commitment requires. */
const CONFIDENCE_UNDERLINE: Record<ConfidenceState, { className: string; word: string }> = {
  confident: { className: "border-solid border-emerald-700", word: "confident" },
  below: { className: "border-dashed border-amber-700", word: "below threshold" },
}

/** Underlines a field's rendered value with its confidence state against the workspace floor
 * (`minConfidence`, the Touchless threshold — see `lib/documents/confidence-state.ts`). Renders
 * its children unstyled when no confidence score was recorded for the field (manual entry, or a
 * field the extraction pipeline never scored) — absence of a signal is a defined "no AI claim",
 * not low confidence. Every extracted-field column in a row wraps its value in one of these, so
 * no scored field goes silently unmarked (#181's objection, answered on #219). */
export function ConfidenceField({ label, value, minConfidence, children }: {
  label: string
  value: number | undefined
  /** 0-1 scale, the workspace's `minConfidence`. */
  minConfidence: number
  children: React.ReactNode
}) {
  const state = confidenceState(value, minConfidence)
  if (state === null || value === undefined) return <>{children}</>
  const { className, word } = CONFIDENCE_UNDERLINE[state]
  const percent = Math.round(value * 100)
  return (
    <span
      className={`inline-block border-b-2 pb-px ${className}`}
      aria-label={`${label}, ${percent}% confidence, ${word}`}
      title={`${percent}% confidence — ${word} (floor ${Math.round(minConfidence * 100)}%)`}
    >
      {children}
    </span>
  )
}

/** One shape per aging bucket, per #187: colour alone never carries the status (WCAG 1.4.1).
 * The bucket's own text label moved to `DueDateCountdownBadge` in
 * `components/documents/countdown-badge.tsx` (#208, generalizing away from the 5-bucket aging
 * ramp this file used to render as `AgingBadge`); this glyph stays here as the compact icon
 * companion column. */
export function StatusGlyph({ bucket }: { bucket: AgingBucket | null }) {
  if (!bucket) return <span className="inline-flex h-4 w-4 items-center justify-center text-slate-400" aria-hidden>—</span>
  if (bucket === "current") {
    return (
      <svg className="h-4 w-4 text-emerald-700" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd" />
      </svg>
    )
  }
  if (bucket === "1-30") {
    return (
      <svg className="h-4 w-4 text-amber-700" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M10 2a1 1 0 011 1v6a1 1 0 01-2 0V3a1 1 0 011-1zm0 12a1.25 1.25 0 110 2.5A1.25 1.25 0 0110 14z" />
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    )
  }
  return (
    <svg className="h-4 w-4 text-red-700" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.486 0l6.516 11.598c.75 1.334-.213 2.98-1.743 2.98H3.484c-1.53 0-2.493-1.646-1.743-2.98L8.257 3.1zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-.25-5.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z" clipRule="evenodd" />
    </svg>
  )
}

/** #200, per #181's resolution: the list's only per-record touchless signal. Two states — this
 * pill, or nothing — no "pending" state (rejected on #181 as race-condition-prone). Reuses the
 * existing STATUS_BADGE pill shape (`components/pipeline/document-list.tsx`); violet is unclaimed
 * by the risk palette (emerald=ready, amber=low-confidence, red=failed, indigo=needs_review,
 * slate=queued), signalling "automation happened" rather than a risk level. Per-field confidence
 * stays detail-only (#181) — this pill is a process fact, not a quality endorsement, which is why
 * the tooltip says "sent automatically", not "high confidence". */
export function TouchlessPill({ minConfidencePercent }: { minConfidencePercent: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700"
      title={`Sent automatically — all fields ≥ ${minConfidencePercent}%`}
    >
      Touchless
    </span>
  )
}

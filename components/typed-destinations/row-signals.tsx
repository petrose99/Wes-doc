import { confidenceState, type ConfidenceState } from "@/lib/documents/confidence-state"
import { PROCESSING_STATE_LABELS, type ProcessingState } from "@/lib/documents/processing-state"

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

/** #222/#223 (Wayfinder map #177): the row's leading-edge processing-state mark — what replaced
 * the old aging `StatusGlyph` (aging now lives only in `DueDateCountdownBadge`'s text, per #208)
 * and the Status-cell `TouchlessPill` (Vic shows one autopilot icon, not icon-plus-pill). One
 * authored shape per state, one stroke weight, never colour alone (#187): the shapes stay
 * distinguishable from each other with colour removed. Not `aria-hidden` — the accessible name is
 * the state word, and Touchless additionally carries the pill's old threshold sentence since nothing
 * else on the row says it now. */
export function ProcessingStateGlyph({ state, minConfidencePercent }: {
  state: ProcessingState
  /** Only read for the Touchless state's accessible name. */
  minConfidencePercent?: number
}) {
  const label = state === "touchless"
    ? `${PROCESSING_STATE_LABELS[state]} — sent automatically, all fields ≥ ${minConfidencePercent}%`
    : PROCESSING_STATE_LABELS[state]

  if (state === "cancelled") {
    return (
      <svg className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" role="img" aria-label={label}>
        <title>{label}</title>
        <circle cx="10" cy="10" r="7" />
        <line x1="5.5" y1="14.5" x2="14.5" y2="5.5" />
      </svg>
    )
  }
  if (state === "needs_attention") {
    return (
      <svg className="h-4 w-4 text-red-700" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label}>
        <title>{label}</title>
        <path d="M10 3l7.5 13.5h-15L10 3z" />
        <line x1="10" y1="8.5" x2="10" y2="12" />
        <circle cx="10" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  if (state === "in_review") {
    return (
      <svg className="h-4 w-4 text-blue-700" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" role="img" aria-label={label}>
        <title>{label}</title>
        <circle cx="10" cy="10" r="7" strokeDasharray="2.1 2.4" />
      </svg>
    )
  }
  if (state === "touchless") {
    return (
      <svg className="h-4 w-4 text-violet-700" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label}>
        <title>{label}</title>
        <path d="M11 2.5L4.5 11h4L7.5 17.5 15.5 9h-4l-0.5-6.5z" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  return (
    <svg className="h-4 w-4 text-emerald-700" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label}>
      <title>{label}</title>
      <path d="M4.5 10.5l3.5 3.5 7-8" />
    </svg>
  )
}

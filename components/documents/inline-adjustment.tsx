import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

/** #208: the shared shape for "the pipeline corrected this value" — struck-through original
 * beneath the corrected value, in-cell. FX conversion (`FxConversionBadge`) is the one wired
 * consumer today; rounding and tax-correction adjustments are the pipeline's other candidates
 * once they exist, but neither is wired to a real value yet, so this component stays generic
 * rather than baking in FX's vocabulary (currency codes, exchange rates).
 *
 * Two states, both driven by the caller — this component renders whatever it's given and does
 * not decide when an adjustment applies:
 *   - "adjusted": the correction happened — original and corrected are both known.
 *   - "pending": an adjustment is expected but hasn't resolved yet (e.g. FX rate not fetched).
 * A caller with nothing to show (no adjustment applies) renders neither and returns null itself,
 * the way `FxConversionBadge` already does for same-currency documents. */
export type InlineAdjustmentState = "adjusted" | "pending"

type AdjustedChipProps = {
  state: "adjusted"
  correctedValue: string
  originalValue: string
}
type PendingChipProps = {
  state: "pending"
  pendingLabel: string
}
export type InlineAdjustmentChipProps = AdjustedChipProps | PendingChipProps

/** In-cell compact form: the corrected value on top, the struck-through original beneath it. */
export function InlineAdjustmentChip(props: InlineAdjustmentChipProps) {
  if (props.state === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        {props.pendingLabel}
      </span>
    )
  }
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="text-[11px] font-medium text-slate-800">{props.correctedValue}</span>
      <span className="text-[10px] text-slate-400 line-through">{props.originalValue}</span>
    </span>
  )
}

type AdjustedCardProps = {
  state: "adjusted"
  title?: string
  correctedValue: ReactNode
  originalValue: ReactNode
  detail?: ReactNode
}
type PendingCardProps = {
  state: "pending"
  pendingTitle: string
  pendingDetail: ReactNode
}
export type InlineAdjustmentCardProps = AdjustedCardProps | PendingCardProps

/** Full panel form, for the review pane. Same struck-through-beneath-corrected anatomy as the
 * chip, plus a detail line explaining what changed and why — FX uses it for the rate, date, and
 * provider; a future rounding/tax consumer would use it for the rule that fired. */
export function InlineAdjustmentCard(props: InlineAdjustmentCardProps) {
  if (props.state === "pending") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <div className="flex items-center gap-1.5 font-semibold">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          {props.pendingTitle}
        </div>
        <p className="mt-1">{props.pendingDetail}</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      {props.title && <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{props.title}</div>}
      <div className="mt-0.5 text-[13px] font-semibold text-slate-900">{props.correctedValue}</div>
      <div className="text-slate-400 line-through">{props.originalValue}</div>
      {props.detail && <p className="mt-1 text-slate-500">{props.detail}</p>}
    </div>
  )
}

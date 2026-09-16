"use client"

import { useContext } from "react"
import { StatePills } from "@/components/queue/row-cells"
import { PaneDocumentContext } from "@/components/queue/document-actions-menu"
import type { ProcessingState } from "@/lib/documents/processing-state"
import { processingFact, type ProcessingFact } from "@/lib/documents/processing-fact"

/** #258: the pane header's one line under the name, above the stepper (#234) — the state pill
 * plus the fact sentence that explains it, so the row, the pane, the stepper and the Approval
 * tab always agree on the same word. A composition over `StatePills`, not a new primitive.
 *
 * `fact` is row-derived and renders instantly (no skeleton, #259's contract). Once the pane's
 * detail load lands a `decision` on `PaneDocumentContext` for a matching, actor-less Approved/
 * Rejected fact, this upgrades the sentence to name the actor without moving anything else. */
export function StatusLine({ state, fact, ledger, openCheckCodes, cancelledReason, trailing }: {
  state: ProcessingState
  fact: ProcessingFact
  ledger?: string | null
  openCheckCodes?: string[]
  cancelledReason?: string | null
  trailing?: React.ReactNode
}) {
  const doc = useContext(PaneDocumentContext)?.doc
  const decision = doc?.decision
  // The upgrade goes through the same `processingFact` the row used — only the actor input is
  // new, so every other word is identical before and after the detail load (spec §2.2).
  let detail = fact.detail
  let actorName: string | null = null
  if (state === "approved" && decision?.kind === "approved" && !fact.detail.startsWith("by ")) {
    actorName = decision.actorName
    detail = processingFact({ ...fact.input, approvedBy: { actorName: decision.actorName, at: new Date(decision.at) } }).detail
  } else if (state === "needs_attention" && decision?.kind === "rejected" && fact.detail === "rejected") {
    actorName = decision.actorName
    detail = processingFact({ ...fact.input, rejectedBy: decision.actorName }).detail
  } else if (fact.input.approvedBy?.actorName) {
    actorName = fact.input.approvedBy.actorName
  } else if (fact.input.rejectedBy) {
    actorName = fact.input.rejectedBy
  }
  // Long content: a name truncates at 24 characters, a cancelled reason at 80; the full text is
  // in `title` and the Audit tab has it whole.
  const longName = actorName && actorName.length > 24 ? actorName : null
  if (longName) detail = detail.replace(longName, `${longName.slice(0, 23)}…`)
  const longReason = state === "cancelled" && cancelledReason && cancelledReason.length > 80 ? cancelledReason : null
  if (longReason) detail = `${longReason.slice(0, 80)}…`
  const title = longReason ?? longName ?? undefined
  // "Approved by Nadia · 12 Sep" reads as one clause; every other detail is a separate fact
  // after the pane's ` · ` separator ("In review · opened today").
  const separator = detail && !detail.startsWith("by ") ? "· " : ""
  return <p role="status" aria-live="polite" className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] leading-[18px] text-slate-600">
    <StatePills state={state} openCheckCodes={openCheckCodes} cancelledReason={cancelledReason} ledger={ledger} />
    {detail && <span className="min-w-0" title={title}>{separator}{detail}</span>}
    {trailing}
  </p>
}

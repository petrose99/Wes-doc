"use client"

import { useContext } from "react"
import { StatePills } from "@/components/queue/row-cells"
import { PaneDocumentContext } from "@/components/queue/document-actions-menu"
import type { ProcessingState } from "@/lib/documents/processing-state"
import type { ProcessingFact } from "@/lib/documents/processing-fact"

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
  let detail = fact.detail
  if (state === "approved" && decision?.kind === "approved" && !detail.includes("by ")) {
    const date = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(decision.at))
    detail = decision.actorName ? `by ${decision.actorName} · ${date}` : date
  }
  return <p role="status" aria-live="polite" className="flex flex-wrap items-center gap-1.5 text-[13px] leading-[18px] text-slate-600">
    <StatePills state={state} openCheckCodes={openCheckCodes} cancelledReason={cancelledReason} ledger={ledger} />
    {detail && <span className="truncate" title={cancelledReason && cancelledReason.length > 80 ? cancelledReason : undefined}>
      {cancelledReason && detail === cancelledReason && detail.length > 80 ? `${detail.slice(0, 80)}…` : detail}
    </span>}
    {trailing}
  </p>
}

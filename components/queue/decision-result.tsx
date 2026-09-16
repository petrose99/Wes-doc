"use client"

import { Button } from "@/components/ui/button"

/** #257 spec 3.6/3.7: the one offline sentence and the one network-error sentence, shared by
 * the decision bar and every Reject/Approve/Override sheet on both Approvals surfaces (B3). */
export const OFFLINE_REASON = "You're offline — decisions need a connection"
export const NETWORK_ERROR = "Couldn't reach DocuBite. Your reason is kept — try again."

export type Decided<T> = {
  row: T
  outcome: "approved" | "rejected" | "refused"
  /** The server's own sentence when it refused ("Approved by Dana 12s ago — nothing left to decide here"). */
  message?: string
}

/** #257 spec 3.5 "After a decision": replaces the decision bar on the decided row at every width
 * (one code path, B4) — a status line, then Back to list and Next to approve. */
export function DecisionResultStrip<T>({ decided, next, onBack }: {
  decided: Decided<T>
  next: (() => void) | null
  onBack: () => void
}) {
  const line = decided.outcome === "approved" ? "Approved · just now"
    : decided.outcome === "rejected" ? "Rejected · just now"
    : decided.message ?? "This stage is no longer yours to decide."
  return <>
    <p role="status" className={`w-full text-[13px] font-medium sm:mr-auto sm:w-auto ${decided.outcome === "refused" ? "text-amber-900" : "text-emerald-800"}`}>{line}</p>
    <Button type="button" size="sm" variant="outline" onClick={onBack}>Back to list</Button>
    <Button type="button" size="sm" disabled={!next} title={next ? undefined : "Nothing else waiting on you"} onClick={() => next?.()}>Next to approve</Button>
    {!next && <span className="w-full text-[13px] text-slate-600 sm:w-auto">Nothing else waiting on you</span>}
  </>
}

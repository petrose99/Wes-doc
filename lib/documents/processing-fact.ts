import { processingState, type ProcessingState, type ProcessingStateInput } from "./processing-state"

/** #258 (Wayfinder map #226): the fact sentence that follows a state's pill/glyph — "Approved by
 * Nadia K. · 12 Sep 2026", "In review · opened yesterday", "Needs attention · 2 open checks".
 * `processingFact` is the ONE function that computes it; the row-derived sentence (list) and the
 * detail-upgraded sentence (pane, once the audit event loads) both call it — the pane never
 * composes its own words. */
export type ProcessingFactInput = ProcessingStateInput & {
  cancelledReason?: string | null
  /** When the current open ReviewTask was opened — null once resolved or if there never was one. */
  reviewTaskOpenedAt?: Date | null
  /** When the document arrived — the row's own `receivedAt`, used only once `reviewTaskOpenedAt`
   * is unavailable (a document with no ReviewTask at all, still In review because `status` isn't
   * "reviewed" yet). */
  receivedAt?: Date | null
  openCheckCodes?: string[]
  /** Who approved and when, trusted only when `status === "reviewed"` and no later stage decision
   * exists — `document_reviewed` is written even for a Save that leaves the document In review
   * (missing required fields), so the caller must gate this itself (spec §1.2 last row). Null
   * when unknown: an older document reviewed before the audit trail, or the row-derived sentence
   * before the pane's detail load lands. */
  approvedBy?: { actorName: string | null; at: Date } | null
  /** Who rejected, for the Needs attention sentence's actor — pane only; the row-derived sentence
   * never carries it. */
  rejectedBy?: string | null
  /** Passed in so server and client render the same "N days ago" — never computed from
   * `Date.now()` inside this function, which would disagree between the server render and the
   * client's later re-render (hydration mismatch). */
  now?: Date
}

export type ProcessingFact = {
  state: ProcessingState
  /** The words after the state word: "by Nadia K. · 12 Sep 2026", "opened today", "2 open
   * checks". Empty when the bare state word is the whole sentence (Touchless has its own
   * constant; a freshly-approved row with nothing else known has none). */
  detail: string
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Deterministic, given `now` — never the shared `relativeTime` (its `Intl` "numeric: auto" mode
 * says "last week" and only runs correctly on the client, per the #258 spec critic's H2 finding). */
export function daysAgo(at: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY_MS))
}

function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date)
}

export function processingFact(input: ProcessingFactInput): ProcessingFact {
  const state = processingState(input)
  const now = input.now ?? new Date()

  if (state === "cancelled") return { state, detail: input.cancelledReason ?? "" }

  if (state === "needs_attention") {
    if (input.approvalStatus === "rejected") return { state, detail: input.rejectedBy ? `rejected by ${input.rejectedBy}` : "rejected" }
    if (input.escalated) return { state, detail: "escalation open" }
    const openCount = input.openCheckCodes?.length ?? 0
    if (openCount > 0) return { state, detail: openCount === 1 ? "1 open check" : `${openCount} open checks` }
    if (input.heldBack) return { state, detail: "held back from a bulk approve" }
    return { state, detail: "" }
  }

  if (state === "in_review") {
    if (input.reviewTaskOpenedAt) {
      const days = daysAgo(input.reviewTaskOpenedAt, now)
      if (days >= 14) return { state, detail: `opened ${formatDateShort(input.reviewTaskOpenedAt)}` }
      return { state, detail: `opened ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}` }
    }
    if (input.receivedAt) return { state, detail: `received ${formatDateShort(input.receivedAt)}` }
    return { state, detail: "" }
  }

  if (state === "touchless") return { state, detail: "sent automatically" }

  // approved
  if (input.approvedBy) {
    const { actorName, at } = input.approvedBy
    return { state, detail: actorName ? `by ${actorName} · ${formatDateShort(at)}` : formatDateShort(at) }
  }
  return { state, detail: "" }
}

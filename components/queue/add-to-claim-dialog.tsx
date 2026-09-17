"use client"

// #273 S2 — "Add to expense claim": the one dialog every opener (bulk bar, pane ⋯, Approval-tab
// sentence, rejected-state button) reaches. Eligibility is decided by the same `claimEligibility`
// the server runs; a receipt the row calls ineligible is shown held back with its reason, never
// silently dropped. Nothing is pre-selected while the operator has a real choice (spec §4).
import { addToExpenseClaimAction, listMyDraftClaimsAction } from "@/app/(app)/workspaces/[workspaceId]/expense-claim-actions"
import { OFFLINE_REASON } from "@/components/queue/decision-result"
import { EligibilityStrip, ItemizedRecapTable, type ItemizedRecord } from "@/components/typed-destinations/bulk-approve-receipt"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import type { ClaimEligibility } from "@/lib/claims/eligibility"
import type { AddToClaimResult, DraftClaimOption } from "@/lib/claims/facts"
import { ELIGIBILITY_REASON_TEXT } from "@/lib/claims/labels"
import { useOnlineStatus } from "@/lib/client/use-online-status"
import { formatMoney } from "@/lib/money"
import { useCallback, useEffect, useState } from "react"

export const MAX_CLAIM_RECEIPTS = 200

export type ClaimCandidate = {
  documentId: string
  merchant: string | null
  amount: number | null
  currencyCode: string | null
  date: Date | null
  eligibility: ClaimEligibility
}

type Target = { kind: "new" } | { kind: "draft"; claimId: string }

function truncateMerchant(merchant: string | null): string | null {
  if (!merchant) return null
  return merchant.length > 24 ? `${merchant.slice(0, 23)}…` : merchant
}

export function AddToClaimDialog({ open, workspaceId, candidates, forceNew = false, onClose, onAdded }: {
  open: boolean
  workspaceId: string
  candidates: ClaimCandidate[]
  /** The rejected-receipt opener: only "New claim" is offered. */
  forceNew?: boolean
  onClose: () => void
  onAdded: (result: AddToClaimResult) => void
}) {
  const online = useOnlineStatus()
  const [drafts, setDrafts] = useState<DraftClaimOption[] | null>(null)
  const [draftsError, setDraftsError] = useState<string | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [title, setTitle] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDrafts = useCallback(async () => {
    setDraftsError(null)
    setDrafts(null)
    const result = await listMyDraftClaimsAction(workspaceId).catch(() => null)
    if (!result || !result.success || !result.data) { setDraftsError("Couldn't load your drafts."); setDrafts([]); return }
    const list = result.data
    setDrafts(list)
    // Nothing to choose when there are no drafts: New claim is the sole option and is selected.
    if (list.length === 0) setTarget({ kind: "new" })
  }, [workspaceId])

  useEffect(() => {
    if (!open) return
    setTarget(forceNew ? { kind: "new" } : null)
    setTitle("")
    setError(null)
    setPending(false)
    if (forceNew) { setDrafts([]); return }
    void loadDrafts()
  }, [open, forceNew, loadDrafts])

  const chosenDraft = target?.kind === "draft" ? drafts?.find((d) => d.id === target.claimId) ?? null : null
  // The dialog re-derives currency per chosen draft: a receipt in another currency is held back.
  const eligibleRows = candidates.filter((c) => c.eligibility.status === "ready" && (!chosenDraft?.currencyCode || !c.currencyCode || c.currencyCode === chosenDraft.currencyCode))
  const heldBackRows = candidates.filter((c) => !eligibleRows.includes(c)).map((c) => ({
    ...c,
    reason: c.eligibility.status === "not_eligible" ? c.eligibility.reason : "currency_mismatch",
  }))
  const capped = eligibleRows.slice(0, MAX_CLAIM_RECEIPTS)
  const eligible = capped.length
  const total = candidates.length

  const toRecord = (c: ClaimCandidate, note?: string): ItemizedRecord => ({
    id: c.documentId, type: "Receipt", vendor: truncateMerchant(c.merchant), number: null, amount: c.amount, currencyCode: c.currencyCode, dateLabel: "Date", date: c.date, note,
  })

  const disabledReason = eligible === 0 ? "None of these can be claimed."
    : !online ? OFFLINE_REASON
    : target === null ? "Choose a claim."
    : null

  async function submit() {
    if (disabledReason || pending || !target) return
    setPending(true)
    setError(null)
    const documentIds = capped.map((c) => c.documentId)
    const result = await addToExpenseClaimAction(workspaceId, { documentIds, target: target.kind === "new" ? { new: { title: title.trim() || null } } : { claimId: target.claimId } }).catch(() => ({ success: false as const, error: "Something went wrong. Try again." }))
    setPending(false)
    if (!result.success || !result.data) { setError(("error" in result && result.error) || "Something went wrong. Try again."); return }
    onAdded(result.data)
  }

  const showTarget = eligible > 0
  const primaryLabel = pending ? "Adding…" : `Add ${eligible} receipt${eligible === 1 ? "" : "s"}`

  return (
    <Dialog open={open} title="Add to expense claim" description="The receipts you selected, grouped into one claim for approval." width="max-w-lg" placement="center"
      onClose={() => { if (!pending) onClose() }}
      initialFocus={showTarget ? "#claim-target-new" : "#claim-dialog-cancel"}>
      <form aria-busy={pending} className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <EligibilityStrip eligible={eligible} total={total} label={eligibleRows.length > MAX_CLAIM_RECEIPTS ? `The first ${MAX_CLAIM_RECEIPTS} can be added` : "Can be added"} />

        {capped.length > 0 && <div className="max-h-[40vh] overflow-auto"><ItemizedRecapTable records={capped.map((c) => toRecord(c))} /></div>}

        {heldBackRows.length > 0 && <section aria-labelledby="claim-held-back">
          <h3 id="claim-held-back" className="text-sm font-semibold text-slate-900">Held back</h3>
          <div className="mt-2 max-h-[30vh] overflow-auto">
            <ItemizedRecapTable records={heldBackRows.map((c) => toRecord(c, ELIGIBILITY_REASON_TEXT[c.reason]))} />
          </div>
        </section>}

        {showTarget && <fieldset disabled={pending} className="space-y-1">
          <legend className="text-sm font-medium text-slate-800">Add to</legend>
          <div role="radiogroup" aria-label="Add to" className="mt-1 space-y-1">
            <label htmlFor="claim-target-new" className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-slate-800 hover:bg-slate-50">
              <input id="claim-target-new" type="radio" name="claim-target" value="new" className="h-4 w-4 accent-emerald-600" checked={target?.kind === "new"} onChange={() => setTarget({ kind: "new" })} />
              <span>New claim</span>
            </label>
            {target?.kind === "new" && <div className="ml-6 mt-2">
              <label htmlFor="claim-title" className="block text-xs font-medium text-slate-600">Title (optional)</label>
              <input id="claim-title" type="text" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Berlin trip, September"
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
            </div>}
            {!forceNew && drafts === null && !draftsError && <div aria-label="Loading your drafts" className="space-y-1">
              {[0, 1].map((i) => <div key={i} className="ml-2 h-9 animate-pulse rounded-md bg-slate-100" />)}
            </div>}
            {draftsError && <p className="ml-2 text-sm text-slate-600" role="status">{draftsError} <button type="button" onClick={() => void loadDrafts()} className="font-medium text-emerald-700 underline underline-offset-2">Retry</button></p>}
            {drafts?.map((draft) => {
              const id = `claim-target-${draft.id}`
              const summary = `${draft.receiptCount} receipt${draft.receiptCount === 1 ? "" : "s"} · ${draft.mixed ? "mixed currencies" : formatMoney(draft.total, draft.currencyCode)}`
              return <label key={draft.id} htmlFor={id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-slate-800 hover:bg-slate-50">
                <input id={id} type="radio" name="claim-target" value={draft.id} className="h-4 w-4 accent-emerald-600" checked={target?.kind === "draft" && target.claimId === draft.id} onChange={() => setTarget({ kind: "draft", claimId: draft.id })} />
                <span className="truncate">{draft.name}</span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-600">{summary}</span>
              </label>
            })}
          </div>
        </fieldset>}

        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        {/* The disabled-primary reason sits in the footer beside the buttons (r0: it rendered below the
            footer, outside the dialog's padding, as a stray line). */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
          {disabledReason && <p id="claim-dialog-reason" role="status" className="mr-auto text-[13px] text-slate-600">{disabledReason}</p>}
          <Button id="claim-dialog-cancel" type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" size="sm" disabled={!!disabledReason || pending} aria-busy={pending} aria-describedby={disabledReason ? "claim-dialog-reason" : undefined}>{primaryLabel}</Button>
        </div>
      </form>
    </Dialog>
  )
}

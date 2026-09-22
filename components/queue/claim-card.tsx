"use client"

// #273 S3 — the claim section a receipt's Approval tab shows (and the S4 pane renders readOnly).
// A plain <section> + h3 + dl in the PO-match style, never a nested Card. Every ⚠ action goes
// through the shell ConfirmDialog with its consequence named (pre-flight B1); after a successful
// mutation the pane remounts and focus lands on #claim-card-title / #claim-empty-action /
// #claim-empty-text (detail-pane.tsx reload-focus chain).
import { deleteExpenseClaimAction, removeExpenseClaimItemAction, submitExpenseClaimAction, withdrawExpenseClaimAction } from "@/app/(app)/workspaces/[workspaceId]/expense-claim-actions"
import { OFFLINE_REASON } from "@/components/queue/decision-result"
import { PaneDocumentContext } from "@/components/queue/document-actions-menu"
import { ApprovalTimeline } from "@/components/queue/history-tabs"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { ClaimEligibility } from "@/lib/claims/eligibility"
import type { DocumentClaimFacts } from "@/lib/claims/facts"
import { CLAIM_STATUS_LABELS, ELIGIBILITY_REASON_TEXT } from "@/lib/claims/labels"
import { CLAIM_ELIGIBILITY_COPY } from "@/lib/payments/eligibility"
import { useOnlineStatus } from "@/lib/client/use-online-status"
import { formatMoney } from "@/lib/money"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useState } from "react"
import { toast } from "sonner"

export const DESKTOP_HINT = "Creating claims is a desktop action."

/** The S2 dialog is owned by `ReceiptQueue` (Radix unmount contract); the Approval tab's openers
 * reach it through this context. Null outside the Receipts queue (S4 pane, other queues). */
export const AddToClaimContext = createContext<((opts: { documentId: string; forceNew: boolean }) => void) | null>(null)

/** Draft slate · Submitted blue · Approved emerald · Rejected red (#247 d10); the word is the label map's. */
export function ClaimPill({ status, className = "" }: { status: DocumentClaimFacts["status"]; className?: string }) {
  const cls =
    status === "approved" ? "bg-emerald-100 text-emerald-800" :
    status === "rejected" ? "bg-red-50 text-red-800" :
    status === "submitted" ? "bg-blue-100 text-blue-800" :
    "bg-slate-100 text-slate-700"
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls} ${className}`}>{CLAIM_STATUS_LABELS[status]}</span>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/** One creation breakpoint, `md`, for every opener (spec §S2). */
export function useCanCreateClaims(): boolean {
  const [can, setCan] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const update = () => setCan(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return can
}

type Confirm = "submit" | "withdraw" | "remove-last" | "delete" | null

export function ClaimSection({ workspaceId, documentId, facts, eligibility, readOnly = false, onOpenAddDialog }: {
  workspaceId: string
  /** The receipt whose tab this is (S3); undefined in the S4 pane. */
  documentId?: string
  facts: DocumentClaimFacts | null
  eligibility?: ClaimEligibility | null
  readOnly?: boolean
  onOpenAddDialog?: (opts: { forceNew: boolean }) => void
}) {
  const router = useRouter()
  const pane = useContext(PaneDocumentContext)
  const online = useOnlineStatus()
  const canCreate = useCanCreateClaims()
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    pane?.onMutated?.("changed")
    router.refresh()
  }

  async function run(action: () => Promise<{ success: boolean; error?: string | null }>, successToast: string) {
    setBusy(true)
    setError(null)
    const result = await action().catch(() => ({ success: false, error: "Something went wrong. Try again." }))
    setBusy(false)
    if (!result.success) { setError(result.error || "Something went wrong. Try again."); return }
    setConfirm(null)
    toast.success(successToast)
    refresh()
  }

  if (!facts) {
    const reason = eligibility && eligibility.status === "not_eligible" ? ELIGIBILITY_REASON_TEXT[eligibility.reason] : null
    const canAdd = !reason && !readOnly && !!onOpenAddDialog
    return <section aria-labelledby="claim-empty-heading">
      <h3 id="claim-empty-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expense claim</h3>
      <p id="claim-empty-text" tabIndex={-1} className="mt-2 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-sm">
        {reason ? `Not in an expense claim. ${reason}.` : canAdd && canCreate
          ? <>Not in an expense claim. Select it and use <button id="claim-empty-action" type="button" onClick={() => onOpenAddDialog?.({ forceNew: false })} className="font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800">Add to claim</button>.</>
          : <>Not in an expense claim. {canAdd ? DESKTOP_HINT : ""}</>}
      </p>
    </section>
  }

  const receipt = documentId ? facts.receipts.find((r) => r.documentId === documentId) ?? null : null
  const showActions = !readOnly
  const draftEditable = facts.status === "draft" && facts.canDelete
  const amountSuffix = facts.frozen ? "as submitted" : "so far"
  const nReceipts = `${facts.receiptCount} receipt${facts.receiptCount === 1 ? "" : "s"}`
  const totalText = formatMoney(facts.total, facts.currencyCode)

  const confirmProps = (() => {
    switch (confirm) {
      case "submit": return {
        title: `Submit ${facts.name} for approval?`,
        description: `${nReceipts} · ${totalText} is frozen as the amount claimed.${facts.missingAmounts > 0 ? ` ${facts.missingAmounts} receipt${facts.missingAmounts === 1 ? " has" : "s have"} no amount and ${facts.missingAmounts === 1 ? "is" : "are"} claimed as 0.` : ""} ${facts.submitGoesTo} will decide it. You can withdraw it until a stage is decided.`,
        confirmLabel: busy ? "Submitting…" : "Submit for approval", destructive: false,
        onConfirm: () => run(() => submitExpenseClaimAction(workspaceId, facts.id, facts.claimant.id), `Submitted ${facts.name}`),
      }
      case "withdraw": return {
        title: `Withdraw ${facts.name}?`,
        description: "It goes back to draft and leaves Ready to Approve. You can edit it and submit it again.",
        confirmLabel: busy ? "Withdrawing…" : "Withdraw", destructive: false,
        onConfirm: () => run(() => withdrawExpenseClaimAction(workspaceId, facts.id, facts.claimant.id), `Withdrew ${facts.name}`),
      }
      case "remove-last": return {
        title: "Remove the last receipt?",
        description: `${facts.name} would be empty, so the draft is deleted too.`,
        confirmLabel: busy ? "Removing…" : "Remove and delete draft", destructive: true,
        onConfirm: () => run(() => deleteExpenseClaimAction(workspaceId, facts.id, facts.claimant.id), `Removed from ${facts.name}; the empty draft was deleted`),
      }
      case "delete": return {
        title: `Delete ${facts.name}?`,
        description: `Its ${nReceipts} go back to Unclaimed. This cannot be undone.`,
        confirmLabel: busy ? "Deleting…" : "Delete draft", destructive: true,
        onConfirm: () => run(() => deleteExpenseClaimAction(workspaceId, facts.id, facts.claimant.id), `Deleted ${facts.name}`),
      }
      default: return null
    }
  })()

  async function removeReceipt() {
    if (!receipt) return
    if (facts!.receiptCount <= 1) { setConfirm("remove-last"); return }
    await run(() => removeExpenseClaimItemAction(workspaceId, facts!.id, facts!.claimant.id, receipt.itemId), `Removed from ${facts!.name}`)
  }

  return <section aria-labelledby="claim-card-title" className="space-y-3">
    <h3 id="claim-card-title" tabIndex={-1} className="text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-sm">
      {facts.name}<ClaimPill status={facts.status} className="ml-2 align-middle" />
    </h3>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-slate-600">Claimant</dt><dd className="text-slate-800">{facts.claimant.name}{facts.isMine ? " (you)" : ""}</dd>
      <dt className="text-slate-600">Receipts</dt><dd className="tabular-nums text-slate-800">{facts.receiptCount}</dd>
      <dt className="text-slate-600">Amount</dt>
      <dd className="tabular-nums text-slate-800">
        {facts.mixed
          ? <>{facts.byCurrency.map((c) => <span key={c.currencyCode} className="block">{formatMoney(c.total, c.currencyCode)}</span>)}<span className="block text-xs text-amber-800">Two currencies — split the claim before submitting</span></>
          : <>{totalText}{facts.missingAmounts > 0 ? `, ${facts.missingAmounts} without an amount — claimed as 0` : ""} <span className="text-xs text-slate-500">{amountSuffix}</span></>}
      </dd>
      {facts.submittedAt && <><dt className="text-slate-600">Submitted</dt><dd className="text-slate-800">{formatDate(facts.submittedAt)}</dd></>}
      {facts.status === "submitted" && <><dt className="text-slate-600">Waiting on</dt><dd className={facts.waitingOnYou ? "font-semibold text-emerald-800" : "text-slate-800"}>{facts.waitingOnYou ? "you" : facts.waitingOn}{facts.stageLabel ? <span className="font-normal text-slate-500"> · {facts.stageLabel}</span> : null}</dd></>}
      {facts.isMine && facts.canDecide && <><dt className="text-slate-600">Note</dt><dd className="text-slate-800">Your own claim</dd></>}
    </dl>

    {facts.status === "approved" && facts.approval && facts.paidState === "paid" && facts.paidAt && <p className="text-sm text-emerald-800" role="status">In an approved claim · Paid {formatDate(facts.paidAt)}</p>}
    {facts.status === "approved" && facts.approval && facts.paidState === "scheduled" && <p className="text-sm text-emerald-800" role="status">Approved {formatDate(facts.approval.at)} by {facts.approval.by} · Scheduled · <Link href={`/workspaces/${workspaceId}/payments/batches/${facts.scheduledBatch?.id ?? ""}`} className="underline underline-offset-2">{facts.scheduledBatch?.name ?? "batch"}</Link></p>}
    {facts.status === "approved" && facts.approval && facts.paidState === "unpaid" && <p className={`text-sm ${facts.paymentEligibility?.eligible === false ? "text-amber-800" : "text-emerald-800"}`} role="status">Approved {formatDate(facts.approval.at)} by {facts.approval.by} · {facts.paymentEligibility?.eligible === false ? CLAIM_ELIGIBILITY_COPY[facts.paymentEligibility.reason] : "Ready to pay"}</p>}
    {facts.status === "rejected" && facts.rejection && <p className="text-sm text-red-800" role="status">Rejected {formatDate(facts.rejection.at)} by {facts.rejection.by}{facts.rejection.reason ? `: ${facts.rejection.reason}` : ""}</p>}
    {facts.deletedReceiptCount > 0 && <p className="text-xs text-slate-600">{facts.deletedReceiptCount} receipt{facts.deletedReceiptCount === 1 ? " was" : "s were"} deleted after submission. The amount is as submitted.</p>}
    {facts.status === "draft" && !draftEditable && <p className="text-sm text-slate-600">{facts.claimant.name}&rsquo;s draft — only they or an owner can change it.</p>}

    {showActions && draftEditable && <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={!facts.canSubmit || !online} aria-describedby={facts.submitDisabledReason || !online ? "claim-submit-reason" : undefined} onClick={() => setConfirm("submit")}>Submit for approval</Button>
      {receipt && <Button size="sm" variant="outline" disabled={busy || !online} onClick={() => void removeReceipt()}>{busy && confirm === null ? "Removing…" : "Remove this receipt"}</Button>}
      <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" disabled={!online} onClick={() => setConfirm("delete")}>Delete draft</Button>
      {(facts.submitDisabledReason || !online) && <p id="claim-submit-reason" role="status" className="basis-full text-[13px] text-slate-600">{!online ? OFFLINE_REASON : facts.submitDisabledReason}</p>}
    </div>}
    {showActions && facts.status === "submitted" && facts.canWithdraw && <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={!online} aria-describedby={!online ? "claim-withdraw-reason" : undefined} onClick={() => setConfirm("withdraw")}>Withdraw</Button>
      {!online && <p id="claim-withdraw-reason" role="status" className="basis-full text-[13px] text-slate-600">{OFFLINE_REASON}</p>}
    </div>}
    {showActions && facts.status === "rejected" && onOpenAddDialog && <div className="mt-3">
      {canCreate
        ? <Button size="sm" variant="outline" onClick={() => onOpenAddDialog({ forceNew: true })}>Add to a new claim</Button>
        : <p className="text-sm text-slate-600">{DESKTOP_HINT}</p>}
    </div>}
    {error && confirm === null && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

    {facts.timelineApproval && <ApprovalTimeline decisions={facts.decisions} pendingStages={facts.pendingStages} approval={facts.timelineApproval} />}
    {!facts.timelineApproval && facts.status === "approved" && facts.decisions.length > 0 &&
      <ApprovalTimeline decisions={facts.decisions} pendingStages={[]} paid={facts.paidState === "paid" && facts.paidAt ? { at: facts.paidAt, by: facts.paidBy } : null} />}

    {confirmProps && <ConfirmDialog open title={confirmProps.title} description={confirmProps.description} confirmLabel={confirmProps.confirmLabel} destructive={confirmProps.destructive} busy={busy}
      onConfirm={() => void confirmProps.onConfirm()} onCancel={() => { if (!busy) { setConfirm(null); setError(null) } }}>
      {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </ConfirmDialog>}
  </section>
}

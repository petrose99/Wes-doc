"use client"

import { confirmPoMatchAction, rejectPoMatchAction, setPoLineAssignmentsAction, type PoMatchActionData } from "@/app/(app)/workspaces/[workspaceId]/po-match-actions"
import { formatAmount } from "@/components/documents/po-compare"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PoMatchCombobox } from "@/components/pipeline/document-detail/po-match-combobox"
import type { ActionState } from "@/lib/actions"
import type { InvoicePoSummary, PoLink } from "@/models/po-matching"
import { Check, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { setUnsaved } from "@/lib/client/unsaved-changes"

/** #228 Q7 / Q10 / Q11 / Q13: Match manually, the in-row mode on the line-items section. It
 * confirms, replaces or rejects the invoice's Purchase Order and, through the per-row pickers
 * the editor renders while the mode is on, reassigns line matches. No reason is asked — it
 * changes the facts, it does not accept a variance (that is Override Mode's job). Every change
 * is Server-confirmed: the bar shows the summary the action returned, never a guess. */
export function MatchManuallyBar({ workspaceId, documentId, summary, currency, pendingAssignments, onSummary, onDone, onDiscard }: {
  workspaceId: string
  documentId: string
  summary: InvoicePoSummary | null
  currency: string | null
  pendingAssignments: Record<string, number | null>
  onSummary: (next: InvoicePoSummary | null) => void
  onDone: () => void
  /** Leaves the mode with the pending line matches thrown away. */
  onDiscard: () => void
}) {
  const [busy, setBusy] = useState<"confirm" | "reject" | "replace" | "done" | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [escapeNote, setEscapeNote] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const link = summary?.link ?? null
  const dirty = Object.keys(pendingAssignments).length > 0

  const sendBackNote = summary?.approvalRunning ? " The Approval that is running on this invoice will be sent back for review." : ""

  useEffect(() => { headingRef.current?.focus() }, [])
  useEffect(() => {
    setUnsaved("match-manually", dirty ? "Match manually has line matches you have not saved." : null)
    return () => setUnsaved("match-manually", null)
  }, [dirty])
  // Escape leaves the mode when nothing is pending; with pending line matches it does nothing —
  // Discard and Save are the two explicit ways out.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || rejecting) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "SELECT" || target.tagName === "INPUT")) return
      event.stopPropagation()
      if (dirty) { setEscapeNote(true); return }
      onDone()
    }
    // Capture phase, so the Queue screen's Escape (close the pane) never fires from inside the mode.
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [dirty, rejecting, onDone])

  const apply = async (label: "confirm" | "reject" | "replace" | "done", run: () => Promise<ActionState<PoMatchActionData>>) => {
    setBusy(label)
    try {
      const result = await run()
      if (!result.success || !result.data) { toast.error(result.error || "The change was not saved"); return false }
      onSummary(result.data.summary)
      if (result.data.sentBack) toast.message("Sent back for review", { description: "The Approval that was running returns to review because the PO match changed." })
      return true
    } catch {
      toast.error("Could not reach the server. Nothing changed.")
      return false
    } finally { setBusy(null) }
  }

  const finish = async () => {
    if (dirty && link) {
      const ok = await apply("done", () => setPoLineAssignmentsAction(workspaceId, documentId, link.matchId, { ...(link.lineAssignments ?? {}), ...pendingAssignments }))
      if (!ok) return
      toast.success("Line matches saved. Checks re-ran.")
    }
    onDone()
  }

  const describe = (po: PoLink) => [po.poNumber ?? "PO", po.poSupplier, formatAmount(po.poTotal, currency)].filter(Boolean).join(" · ")

  return <section aria-labelledby="match-manually-title" className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="match-manually-title" ref={headingRef} tabIndex={-1} className="text-xs font-semibold text-emerald-900 outline-none">Match manually</h3>
      <span className="flex items-center gap-1.5">
      {dirty && escapeNote && <span role="status" className="text-xs text-slate-700">Save or discard your line matches first.</span>}
      {dirty && <button type="button" onClick={onDiscard} disabled={busy !== null}
        className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">
        Discard changes
      </button>}
      <button type="button" onClick={finish} disabled={busy !== null}
        className="inline-flex min-h-8 items-center gap-1 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:opacity-60">
        {busy === "done" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
        {dirty ? "Save line matches and finish" : "Done"}
      </button>
      </span>
    </div>
    <p className="mt-1 max-w-[60ch] text-xs text-slate-700">
      {link
        ? <>Comparing against <strong className="font-semibold text-slate-900">{describe(link)}</strong>{link.kind === "auto" ? " — matched by the PO number on the invoice, not yet confirmed." : " — confirmed."} Change the PO line on any row below, or change the PO.{sendBackNote}</>
        : summary?.suggestions.length
          ? `Suggested by the matcher — nothing is compared until you confirm a likely PO below, or choose another.${sendBackNote}`
          : summary?.removed ? "The PO link was rejected. Choose a Purchase Order to compare against." : "No Purchase Order is linked. Choose one to compare against."}
    </p>

    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {link?.kind === "auto" && <button type="button" disabled={busy !== null} onClick={() => apply("confirm", () => confirmPoMatchAction(workspaceId, documentId, link.matchId))}
        className="inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">
        {busy === "confirm" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}Confirm {link.poNumber ?? "this PO"}
      </button>}
      <PoMatchCombobox workspaceId={workspaceId} documentId={documentId} link={link} suggestions={link ? [] : (summary?.suggestions ?? [])} currency={currency} busy={busy} apply={apply} />
      {link && <button type="button" disabled={busy !== null} onClick={() => setRejecting(true)}
        className="inline-flex min-h-8 items-center rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60">
        Reject PO
      </button>}
    </div>

    <ConfirmDialog open={rejecting} title={`Reject ${link?.poNumber ?? "this Purchase Order"}?`}
      description={`The invoice will no longer be compared against it: the PO cells clear and the Total's gate is re-evaluated.${sendBackNote} You can choose another PO afterwards. This is recorded on the audit trail.`}
      confirmLabel="Reject PO" onCancel={() => setRejecting(false)}
      onConfirm={async () => { setRejecting(false); if (link) { const ok = await apply("reject", () => rejectPoMatchAction(workspaceId, documentId, link.matchId)); if (ok) toast.success("PO rejected. Checks re-ran.") } }} />
  </section>
}

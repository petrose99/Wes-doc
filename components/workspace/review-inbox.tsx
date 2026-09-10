"use client"

import { assignReviewTaskAction, bulkUpdateReviewTaskStatusAction, decideReviewTaskStageAction, getReviewTaskDetailAction, setDocumentPaymentStatusAction, startWorkflowOnReviewTaskAction, updateReviewTaskStatusAction } from "@/app/(app)/workspaces/[workspaceId]/review-actions"
import { pushDocumentToAccountingAction } from "@/app/(app)/workspaces/[workspaceId]/integration-push-actions"
import { DocumentPreview } from "@/components/documents/document-preview"
import { AutomationRuleForm } from "@/components/workspace/automation-rule-form"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Bot, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

export type ReviewQueueRow = {
  id: string
  status: string
  reason: string
  priority: number
  dueAt: string | null
  document: {
    id: string
    filename: string
    templateName: string | null
    minConfidence: number | null
    appliedRuleName: string | null
    checks: { code: string; status: "warn" | "fail"; message: string }[]
    review: { supplier: string | null; category: string; total: string | null }
  }
  assignee: { id: string; name: string } | null
}

type TaskDetail = Awaited<ReturnType<typeof getReviewTaskDetailAction>>

const REASON_LABELS: Record<string, string> = { manual: "Manual", low_confidence: "Low confidence", rule_required: "Rule required", check_failed: "Check failed", ai_suggestion: "AI suggestion" }
const CHECK_LABELS: Record<string, string> = {
  duplicate: "Duplicate", invoice_arithmetic: "Arithmetic", statement_balance: "Balance",
  missing_statement_period: "Gap", tax_consistency: "Tax", suspicious_resubmission: "Resubmission",
}
/** The status buttons a reviewer picks from. `in_review` is deliberately absent — the server
 * sets it as a machine transition when a workflow starts (see startWorkflowOnReviewTask), so
 * putting it on this button row asked users to pick a state the system owns. `approved` leads
 * because it is the goal of the whole surface; `open` and `rejected` follow as outlines. */
const STATUS_OPTIONS = ["approved", "open", "rejected"] as const

function ConfidenceDot({ score }: { score: number | null }) {
  if (score === null) return null
  // Traffic-light severity scale (emerald/amber/red = high/medium/low confidence) — amber is kept
  // here rather than converted to indigo so the middle tier still reads as "caution" between the
  // emerald "good" and red "bad" ends.
  const color = score >= 0.8 ? "bg-emerald-500" : score >= 0.5 ? "bg-amber-500" : "bg-red-500"
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={`Lowest field confidence: ${Math.round(score * 100)}%`} />
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

/** The costs-inbox split view: a keyboard-driven list on the left, the selected document's
 * preview/fields/controls on the right — reusing DocumentPreview and AutomationRuleForm rather
 * than duplicating either. `j`/`k` move the selection, `e` approves, `p` pushes when the selected
 * document is push-eligible; all three are optimistic (the row leaves the current tab's list, or
 * the push button reflects "Pushed", immediately) with an undo toast backing out the server change
 * if the person didn't mean it. Shortcuts are ignored while any form control has focus, so they
 * never fight with the create-rule form or a text field. */
export function ReviewInbox({ workspaceId, tasks, currentStatus, members }: {
  workspaceId: string
  tasks: ReviewQueueRow[]
  /** The active status tab ("open" by default) — undefined/"all" means no client-side filtering
   * on top of what the server already returned. */
  currentStatus: string | undefined
  members: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(tasks[0]?.id ?? null)
  const [detail, setDetail] = useState<TaskDetail>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [pushed, setPushed] = useState<Set<string>>(new Set())
  /** Receipts for successful pushes, keyed by task id: destination name + when. The disabled
   * "Pushed" button alone was a dead end at the highest-stakes success moment. */
  const [pushReceipts, setPushReceipts] = useState<Record<string, { destination: string; at: Date }>>({})
  /** Which bulk decision is awaiting confirmation, if any. Bulk approve commits every selected
   * bill in one click — the one action here that must never run off a stray mis-click, so it gets
   * the same ConfirmDialog treatment a delete does. Reject on a workflow stage gets the same
   * guard ("stage-reject") since it kills the bill's approval run. */
  const [confirming, setConfirming] = useState<"approved" | "rejected" | "stage-reject" | null>(null)
  /** Optional reason typed into the stage-reject dialog. Collected right in the confirm — the
   * earlier copy sent people off to "add a note on the document", a multi-click detour nobody
   * took. Cleared whenever the dialog closes so a stale note never rides along on the next reject. */
  const [rejectNote, setRejectNote] = useState("")
  const detailTaskIdRef = useRef<string | null>(null)

  // Adjusted during render (React's own recommended pattern for "reset derived state when a prop
  // changes") rather than in an effect: the server already refetched a tab-filtered list on
  // revalidate, so once its `tasks` prop is a new reference there is nothing left for the
  // optimistic overlay to hide.
  const [tasksSeen, setTasksSeen] = useState(tasks)
  if (tasks !== tasksSeen) {
    setTasksSeen(tasks)
    setOptimisticStatus({})
    setPushed(new Set())
    // pushReceipts is deliberately NOT reset here: a receipt records something that already
    // happened, and the refresh after approve/assign would otherwise wipe it seconds after the
    // push it confirms.
  }

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const status = optimisticStatus[task.id] ?? task.status
    return !currentStatus || currentStatus === "all" || status === currentStatus
  }), [tasks, optimisticStatus, currentStatus])

  // Same render-time adjustment: if the selection fell out of view (approved off the Open tab,
  // or the list itself just changed), snap to the first visible row instead of a dangling id.
  const effectiveSelectedId = selectedId && visibleTasks.some((task) => task.id === selectedId) ? selectedId : (visibleTasks[0]?.id ?? null)
  if (effectiveSelectedId !== selectedId) setSelectedId(effectiveSelectedId)

  useEffect(() => {
    if (!effectiveSelectedId) { setDetail(null); return }
    detailTaskIdRef.current = effectiveSelectedId
    setDetailLoading(true)
    getReviewTaskDetailAction(workspaceId, effectiveSelectedId).then((result) => {
      // A fast j/k could have moved the selection again before this resolves — drop a stale
      // response rather than paint the wrong document into the pane.
      if (detailTaskIdRef.current === effectiveSelectedId) { setDetail(result); setDetailLoading(false) }
    })
  }, [effectiveSelectedId, workspaceId])

  // router.refresh() only re-renders the server-rendered list (`tasks`) — the detail pane is
  // client state fetched once per selection change (the effect above), so a workflow decision or
  // a fresh workflow start has to explicitly re-fetch it or the pane just keeps showing the stage
  // it was on before the click, forever, since effectiveSelectedId never changes underneath it.
  const refetchDetail = useCallback(async (taskId: string) => {
    const result = await getReviewTaskDetailAction(workspaceId, taskId)
    if (detailTaskIdRef.current === taskId) setDetail(result)
  }, [workspaceId])

  const changeStatus = useCallback(async (taskId: string, status: string, previousStatus: string) => {
    setOptimisticStatus((previous) => ({ ...previous, [taskId]: status }))
    try {
      const result = await updateReviewTaskStatusAction(workspaceId, taskId, status)
      if (!result.success) {
        setOptimisticStatus((previous) => ({ ...previous, [taskId]: previousStatus }))
        toast.error(result.error || "Could not update status")
        return
      }
      toast.success(`Marked ${status.replace("_", " ")}`, {
        action: {
          label: "Undo",
          onClick: () => {
            setOptimisticStatus((previous) => ({ ...previous, [taskId]: previousStatus }))
            void updateReviewTaskStatusAction(workspaceId, taskId, previousStatus).then(() => router.refresh())
          },
        },
      })
      router.refresh()
    } catch {
      setOptimisticStatus((previous) => ({ ...previous, [taskId]: previousStatus }))
      toast.error("Could not reach the server")
    }
  }, [workspaceId, router])

  const decideStage = useCallback(async (taskId: string, decision: "approve" | "reject", note?: string) => {
    setPending(true)
    try {
      const result = await decideReviewTaskStageAction(workspaceId, taskId, decision, note)
      if (!result.success) { toast.error(result.error || "Could not record that decision"); return }
      toast.success(decision === "approve" ? "Stage approved" : note ? "Rejected — note recorded" : "Rejected")
      await refetchDetail(taskId)
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }, [workspaceId, router, refetchDetail])

  const startWorkflow = async (taskId: string, workflowId: string) => {
    if (!workflowId) return
    setPending(true)
    try {
      const result = await startWorkflowOnReviewTaskAction(workspaceId, taskId, workflowId)
      if (!result.success) { toast.error(result.error || "Could not start that workflow"); return }
      toast.success("Workflow started")
      await refetchDetail(taskId)
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }

  const confirmPayment = useCallback(async (documentId: string, status: "paid" | "unpaid") => {
    if (!detail) return
    setPending(true)
    try {
      const result = await setDocumentPaymentStatusAction(workspaceId, documentId, status)
      if (!result.success) { toast.error(result.error || "Could not record payment status"); return }
      await refetchDetail(detail.id)
    } catch {
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }, [workspaceId, detail, refetchDetail])

  /** `force` is the "Push again" path: it skips the already-pushed guard, which otherwise
   * short-circuits on the stale `pushed` set this callback closed over — the setPushed the
   * button fires first doesn't reach this closure until the next render, so without the flag
   * the first "Push again" click (and a repeated `p`) is a silent no-op. No success toast:
   * the inline receipt below the button is the success signal, and one is enough. */
  const pushSelected = useCallback(async (force = false) => {
    if (!detail?.canPush || !detail.activeConnectionId || (!force && pushed.has(detail.id))) return
    setPushed((previous) => new Set(previous).add(detail.id))
    try {
      const result = await pushDocumentToAccountingAction(workspaceId, detail.document.id, detail.activeConnectionId)
      if (!result.success) {
        setPushed((previous) => { const next = new Set(previous); next.delete(detail.id); return next })
        toast.error(result.error || "Could not push this document")
        return
      }
      const destination = detail.activeConnection?.name ?? "accounting"
      setPushReceipts((previous) => ({ ...previous, [detail.id]: { destination, at: new Date() } }))
    } catch {
      setPushed((previous) => { const next = new Set(previous); next.delete(detail.id); return next })
      toast.error("Could not reach the server")
    }
  }, [workspaceId, detail, pushed])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return
      if (!visibleTasks.length) return
      const index = effectiveSelectedId ? visibleTasks.findIndex((task) => task.id === effectiveSelectedId) : -1
      if (event.key === "j") {
        event.preventDefault()
        setSelectedId(visibleTasks[Math.min(index + 1, visibleTasks.length - 1)]?.id ?? visibleTasks[0].id)
      } else if (event.key === "k") {
        event.preventDefault()
        setSelectedId(visibleTasks[Math.max(index - 1, 0)]?.id ?? visibleTasks[0].id)
      } else if (event.key === "e" && effectiveSelectedId) {
        event.preventDefault()
        const task = visibleTasks.find((t) => t.id === effectiveSelectedId)
        if (!task) return
        // A task on a workflow needs its current stage decided, not a direct status write — and
        // that requires the loaded detail (for canDecideCurrentStage), not just the list row.
        if (detail && detail.id === task.id && detail.workflow) {
          if (detail.workflow.canDecideCurrentStage) void decideStage(task.id, "approve")
        } else if (!detail?.workflow) {
          // Same gate the Approve button applies — see its `blocked` computation above. The
          // server enforces this regardless; this only saves a round trip for the common case.
          if (detail && detail.id === task.id && detail.document.paymentConfirmationRequired && !detail.document.paymentStatus) {
            toast.warning("Confirm paid/unpaid first")
          } else {
            void changeStatus(task.id, "approved", optimisticStatus[task.id] ?? task.status)
          }
        }
      } else if (event.key === "p") {
        event.preventDefault()
        void pushSelected()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [visibleTasks, effectiveSelectedId, detail, optimisticStatus, changeStatus, decideStage, pushSelected])

  const toggleBulk = (id: string) => setBulkSelected((previous) => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleBulkAll = () => setBulkSelected((previous) => (previous.size === visibleTasks.length ? new Set() : new Set(visibleTasks.map((task) => task.id))))

  const bulk = async (status: string) => {
    if (!bulkSelected.size) return
    setPending(true)
    const ids = [...bulkSelected]
    // Kept so a blocked row's optimistic status can be put back afterward — reverting to whatever
    // the row actually shows now (task.status), not assuming it was "open".
    const previousStatus = new Map(ids.map((id) => [id, optimisticStatus[id] ?? tasks.find((task) => task.id === id)?.status ?? "open"]))
    setOptimisticStatus((previous) => { const next = { ...previous }; for (const id of ids) next[id] = status; return next })
    try {
      const result = await bulkUpdateReviewTaskStatusAction(workspaceId, ids, status)
      if (!result.success) { toast.error(result.error || "Could not update the selected tasks"); return }
      const blockedTaskIds = result.data?.blockedTaskIds ?? []
      if (blockedTaskIds.length) {
        setOptimisticStatus((previous) => { const next = { ...previous }; for (const id of blockedTaskIds) next[id] = previousStatus.get(id)!; return next })
      }
      const updated = result.data?.updated ?? 0
      // Same escape hatch the single-row path has had all along: put the rows that actually moved
      // back to whatever each one showed before. Rows can arrive with different prior statuses
      // (the All tab mixes open and in_review), so the revert groups by prior status and issues
      // one bulk call per group.
      const movedIds = ids.filter((id) => !blockedTaskIds.includes(id))
      const undoBulk = () => {
        setOptimisticStatus((previous) => { const next = { ...previous }; for (const id of movedIds) next[id] = previousStatus.get(id)!; return next })
        const groups = new Map<string, string[]>()
        for (const id of movedIds) {
          const prior = previousStatus.get(id)!
          groups.set(prior, [...(groups.get(prior) ?? []), id])
        }
        void Promise.all([...groups].map(([prior, group]) => bulkUpdateReviewTaskStatusAction(workspaceId, group, prior))).then(() => router.refresh())
      }
      const undoAction = movedIds.length ? { action: { label: "Undo", onClick: undoBulk } } : undefined
      if (updated && blockedTaskIds.length) {
        toast.success(`${updated} task${updated === 1 ? "" : "s"} updated`, undoAction)
        toast.warning(`${blockedTaskIds.length} withheld — confirm paid/unpaid first`)
      } else if (blockedTaskIds.length) {
        toast.warning(`Confirm paid/unpaid on ${blockedTaskIds.length} document${blockedTaskIds.length === 1 ? "" : "s"} before approving`)
      } else {
        toast.success(`${updated} task${updated === 1 ? "" : "s"} updated`, undoAction)
      }
      setBulkSelected(new Set())
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }

  const setAssignee = async (taskId: string, value: string) => {
    const result = await assignReviewTaskAction(workspaceId, taskId, value || null)
    if (!result.success) toast.error(result.error || "Could not assign")
    router.refresh()
  }

  if (!tasks.length) return <div className="rounded-md border border-dashed p-8 text-center text-sm text-slate-500">
    Nothing here. Documents land in this queue when a supplier rule needs confirmation, a field is read at low
    confidence, or a document check (duplicate, arithmetic, tax, or a gap) fires — or when someone adds one
    manually from a document&apos;s page.
  </div>

  return <div className="space-y-3">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
    <div>
      {bulkSelected.size > 0 && <div className="sticky top-2 z-10 mb-2 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm shadow-sm">
        <span className="font-medium text-emerald-900">{bulkSelected.size} selected</span>
        <Button type="button" size="sm" disabled={pending} onClick={() => setConfirming("approved")}>Approve</Button>
        <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => setConfirming("rejected")}>Reject</Button>
      </div>}
      <ConfirmDialog
        open={confirming === "approved" || confirming === "rejected"}
        destructive={confirming === "rejected"}
        busy={pending}
        title={`${confirming === "rejected" ? "Reject" : "Approve"} ${bulkSelected.size} document${bulkSelected.size === 1 ? "" : "s"}?`}
        description={confirming === "rejected"
          ? "Every selected document is marked rejected. You can undo from the toast afterwards."
          : "Every selected document is marked approved — which can auto-publish them and sync them to accounting. Documents still waiting on a paid/unpaid answer are held back."}
        confirmLabel={confirming === "rejected" ? "Reject all" : "Approve all"}
        onConfirm={() => { const status = confirming; setConfirming(null); if (status && status !== "stage-reject") void bulk(status) }}
        onCancel={() => setConfirming(null)} />
      {/* Hoisted out of the detail pane so a mid-flight refetch that nulls `detail` can't unmount
          the open dialog under the user; the task id is read from the selection at confirm time. */}
      <ConfirmDialog
        open={confirming === "stage-reject"}
        destructive
        busy={pending}
        title="Reject this stage?"
        description="The document is marked rejected at this stage of its approval workflow, and its run ends."
        confirmLabel="Reject"
        onConfirm={() => {
          const taskId = effectiveSelectedId
          const note = rejectNote.trim()
          setConfirming(null)
          setRejectNote("")
          if (taskId) void decideStage(taskId, "reject", note || undefined)
        }}
        onCancel={() => { setConfirming(null); setRejectNote("") }}>
        <textarea
          value={rejectNote}
          onChange={(event) => setRejectNote(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Why? (optional — recorded in the document's activity)"
          className="w-full rounded-md border px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-600" />
      </ConfirmDialog>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="w-8 py-2"><input type="checkbox" checked={bulkSelected.size === visibleTasks.length && visibleTasks.length > 0} onChange={toggleBulkAll} aria-label="Select all" /></th>
            <th className="w-6 py-2"></th>
            <th className="py-2 pr-4 font-medium">Supplier</th>
            <th className="py-2 pr-4 font-medium">Category</th>
            <th className="py-2 pr-4 font-medium">Total</th>
            <th className="py-2 pr-4 font-medium">Flags</th>
            <th className="py-2 pr-4 font-medium">Reason</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {visibleTasks.map((task) => {
            const status = optimisticStatus[task.id] ?? task.status
            const selected = task.id === effectiveSelectedId
            return <tr key={task.id} onClick={() => setSelectedId(task.id)}
              className={`cursor-pointer border-b last:border-0 ${selected ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
              <td className="py-2" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={bulkSelected.has(task.id)} onChange={() => toggleBulk(task.id)} aria-label={`Select ${task.document.review.supplier ?? task.document.filename}`} /></td>
              <td className="py-2"><ConfidenceDot score={task.document.minConfidence} /></td>
              <td className="py-2 pr-4">
                <span className="font-medium text-slate-900">{task.document.review.supplier ?? "Unknown supplier"}</span>
                {task.document.templateName && <span className="ml-1.5 text-xs text-slate-400">{task.document.templateName}</span>}
              </td>
              <td className="py-2 pr-4 text-slate-500">{task.document.review.category}</td>
              <td className="py-2 pr-4 text-slate-500">{task.document.review.total ?? "—"}</td>
              <td className="py-2 pr-4">
                <div className="flex flex-wrap gap-1">
                  {task.document.appliedRuleName && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600" title={`Rule: ${task.document.appliedRuleName}`}>Rule applied</span>}
                  {/* fail=red / warn=amber is a severity pairing (fail is worse than warn); amber
                      is kept rather than converted so the two check states stay visually distinct. */}
                  {task.document.checks.map((check) => (
                    <span key={check.code} title={check.message} className={`rounded-full px-2 py-0.5 text-xs font-medium ${check.status === "fail" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                      {CHECK_LABELS[check.code] ?? check.code}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2 pr-4 text-slate-600">{REASON_LABELS[task.reason] || task.reason}</td>
              <td className="py-2"><span className="rounded-full border px-2 py-0.5 text-xs font-medium capitalize text-slate-600">{status.replace("_", " ")}</span></td>
            </tr>
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">Click a row, or use <kbd className="rounded border px-1">j</kbd>/<kbd className="rounded border px-1">k</kbd> to move, <kbd className="rounded border px-1">e</kbd> to approve, <kbd className="rounded border px-1">p</kbd> to push.</p>
    </div>

    <div className="sticky top-4 self-start rounded border">
      {!effectiveSelectedId ? (
        <div className="p-6 text-center text-sm text-slate-400">Select a document to review.</div>
      ) : detailLoading || !detail ? (
        <div className="space-y-3 p-4">
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="h-40 animate-pulse rounded bg-slate-100" />
        </div>
      ) : (
        <div className="max-h-[80vh] overflow-y-auto p-4">
          <h2 className="font-bold text-slate-900">{detail.document.filename}</h2>

          {detail.document.storageKey
            ? <DocumentPreview src={`/api/documents/${detail.document.id}/source`} filename={detail.document.filename} mimeType={detail.document.mimeType} className="mt-3 h-64 rounded border" />
            : <p className="mt-3 rounded border border-dashed p-4 text-center text-xs text-slate-400">Source not available</p>}

          {detail.reason === "ai_suggestion" && detail.document.codingSource === "ai" && <div className="mt-3 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
            <Bot className="h-4 w-4 text-indigo-600" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-indigo-800">AI-suggested coding</p>
              {typeof detail.document.codingConfidence === "number" && <p className="text-[10px] text-indigo-600">Confidence: {Math.round(detail.document.codingConfidence * 100)}%</p>}
            </div>
          </div>}

          {detail.document.codingSource === "history" && <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <Bot className="h-4 w-4 text-emerald-700" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-emerald-800">Auto-coded from vendor history</p>
              <p className="text-[10px] text-emerald-700">Matched what this vendor was consistently coded to before.</p>
            </div>
          </div>}

          <div className="mt-4 space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Assignee</label>
            <select className="w-full rounded-md border px-2.5 py-1.5 text-sm" defaultValue={detail.assigneeId ?? ""} onChange={(event) => void setAssignee(detail.id, event.target.value)}>
              <option value="">Unassigned</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </div>

          {detail.document.paymentConfirmationRequired && (
            <div className="mt-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Paid?</label>
              <div className="mt-1.5 flex gap-2">
                {(["paid", "unpaid"] as const).map((option) => (
                  <Button key={option} type="button" size="sm" variant="outline" disabled={pending}
                    aria-pressed={detail.document.paymentStatus === option}
                    className={`capitalize ${detail.document.paymentStatus === option ? (option === "paid" ? "border-emerald-700 bg-emerald-50 text-emerald-800 hover:bg-emerald-50" : "border-amber-600 bg-amber-50 text-amber-800 hover:bg-amber-50") : ""}`}
                    onClick={() => void confirmPayment(detail.document.id, option)}>
                    {option}
                  </Button>
                ))}
              </div>
              {!detail.document.paymentStatus && <p className="mt-1 text-xs text-amber-700">Required before this can be approved.</p>}
            </div>
          )}

          {detail.workflow ? (
            <div className="mt-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{detail.workflow.name}</label>
              <p className="mt-1 text-xs text-slate-500">
                Stage {detail.workflow.currentStageIndex + 1} of {detail.workflow.stages.length}: {detail.workflow.stages[detail.workflow.currentStageIndex]?.name}
                {detail.workflow.stages[detail.workflow.currentStageIndex]?.requireOwner ? " (owner only)" : ""}
              </p>
              {detail.status === "in_review" ? (
                detail.workflow.canDecideCurrentStage ? (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {(() => {
                      // Only the LAST stage clearing actually resolves the task as "approved" (see
                      // decideStage in lib/approvals/engine.ts) — an earlier stage's approve just
                      // advances currentStageIndex, so it needs no payment confirmation yet.
                      const isLastStage = detail.workflow!.currentStageIndex === detail.workflow!.stages.length - 1
                      const blocked = isLastStage && detail.document.paymentConfirmationRequired && !detail.document.paymentStatus
                      return <Button type="button" size="sm" disabled={pending || blocked} title={blocked ? "Confirm paid/unpaid first" : undefined}
                        onClick={() => void decideStage(detail.id, "approve")}>Approve stage</Button>
                    })()}
                    <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => setConfirming("stage-reject")}>Reject</Button>
                  </div>
                ) : <p className="mt-1.5 text-xs text-indigo-700">Only a workspace owner can decide this stage.</p>
              ) : <p className="mt-1.5 text-xs font-medium capitalize text-slate-600">{detail.status.replace("_", " ")}</p>}
            </div>
          ) : (
            <div className="mt-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((option) => {
                  const current = optimisticStatus[detail.id] ?? detail.status
                  const blocked = option === "approved" && detail.document.paymentConfirmationRequired && !detail.document.paymentStatus
                  // Approve is the goal — default (primary) variant; the others are outline so the
                  // primary action is unambiguous. Reject uses the destructive variant, same as
                  // the workflow-stage Reject and the bulk Reject.
                  const variant = option === "approved" ? "default" : option === "rejected" ? "destructive" : "outline"
                  return <Button key={option} type="button" size="sm" variant={variant} disabled={current === option || blocked} title={blocked ? "Confirm paid/unpaid first" : undefined}
                    className={`capitalize ${current === option && variant === "outline" ? "border-emerald-700 bg-emerald-50 text-emerald-800 hover:bg-emerald-50" : ""}`}
                    onClick={() => void changeStatus(detail.id, option, current)}>
                    {option === "approved" ? "Approve" : option === "rejected" ? "Reject" : "Reopen"}
                  </Button>
                })}
              </div>
              {detail.availableWorkflows.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <select className="flex-1 rounded-md border px-2.5 py-1.5 text-xs" defaultValue="" onChange={(event) => void startWorkflow(detail.id, event.target.value)}>
                    <option value="" disabled>Start an approval workflow…</option>
                    {detail.availableWorkflows.map((wf) => <option key={wf.id} value={wf.id}>{wf.name} ({wf.stageCount} stage{wf.stageCount === 1 ? "" : "s"})</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {detail.canPush && (() => {
            // Prefer the in-memory receipt from this session (destination + wall-clock time we
            // observed at the point of push); fall back to detail.lastSuccessfulPush so a hard
            // reload doesn't wipe the money-adjacent success moment. `pushed` tracks in-flight
            // and just-completed pushes; `hasReceipt` covers the reload case where no push has
            // fired in this session but the server remembers one.
            const memoryReceipt = pushReceipts[detail.id]
            const serverReceipt = detail.lastSuccessfulPush
              ? { destination: detail.lastSuccessfulPush.destination, at: new Date(detail.lastSuccessfulPush.at) }
              : null
            const receipt = memoryReceipt ?? serverReceipt
            const isPushed = pushed.has(detail.id) || Boolean(serverReceipt)
            return <div className="mt-3 space-y-1.5">
              {!isPushed
                ? <Button type="button" className="w-full" onClick={() => void pushSelected()}>
                    Push to {detail.activeConnection?.name ?? "accounting"}
                  </Button>
                : <div className="flex items-center gap-2">
                    <div className="flex flex-1 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">Pushed to {receipt?.destination ?? detail.activeConnection?.name ?? "accounting"}</span>
                        {receipt?.at && <span className="ml-1 text-emerald-700/80">· {receipt.at.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
                      </span>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => void pushSelected(true)}>
                      Push again
                    </Button>
                  </div>}
            </div>
          })()}

          {detail.checkResults.length > 0 && <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checks</h3>
            <ul className="mt-1.5 space-y-1.5 text-sm">
              {detail.checkResults.map((check) => (
                <li key={check.id} className="flex items-start gap-2">
                  {/* Same fail/warn severity pairing as the flags column above — amber kept intentionally. */}
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${check.status === "fail" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{check.status}</span>
                  <span className="text-slate-600">{check.message}</span>
                </li>
              ))}
            </ul>
          </div>}

          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted fields</h3>
            <dl className="mt-1.5 space-y-1.5 text-sm">
              {detail.document.fields.map((field) => (
                <div key={field.key} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{field.label}</dt>
                  <dd className="text-right font-medium text-slate-900">{formatValue(detail.document.values[field.key])}</dd>
                </div>
              ))}
            </dl>
          </div>

          {detail.canCreateRule && <details className="mt-4 rounded border p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">Create a rule from this document</summary>
            <div className="mt-3"><AutomationRuleForm workspaceId={workspaceId} defaultSupplier={detail.document.supplier} /></div>
          </details>}
        </div>
      )}
    </div>
    </div>
  </div>
}

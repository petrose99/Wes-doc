"use client"

import { assignReviewTaskAction, decideReviewTaskStageAction, startWorkflowOnReviewTaskAction, updateReviewTaskStatusAction } from "@/app/(app)/workspaces/[workspaceId]/review-actions"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

export type ReviewTaskWorkflow = {
  id: string
  name: string
  currentStageIndex: number
  stages: { stageIndex: number; name: string; requireOwner: boolean }[]
  canDecideCurrentStage: boolean
}

export function ReviewTaskDetail({ workspaceId, taskId, status, assigneeId, members, workflow, availableWorkflows = [] }: {
  workspaceId: string
  taskId: string
  status: string
  assigneeId: string | null
  members: { id: string; name: string }[]
  /** Non-null once a workflow is attached — replaces the plain four-button status control with
   * stage progress and an approve/reject-this-stage pair. */
  workflow?: ReviewTaskWorkflow | null
  /** Active workflows this workspace could start on this task — only meaningful (and only ever
   * passed non-empty) while the task is still "open" and has no workflow of its own yet. */
  availableWorkflows?: { id: string; name: string; stageCount: number }[]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: "status" | "alert"; message: string } | null>(null)

  const setStatus = async (next: string) => {
    setPending(true)
    setFeedback({ tone: "status", message: `Saving status: ${next.replace("_", " ")}…` })
    try {
      const result = await updateReviewTaskStatusAction(workspaceId, taskId, next)
      if (!result.success) { const message = result.error || "Could not update status"; setFeedback({ tone: "alert", message }); toast.error(message); return }
      setFeedback({ tone: "status", message: `Status updated to ${next.replace("_", " ")}` })
      toast.success(`Marked ${next.replace("_", " ")}`)
      router.refresh()
    } catch {
      setFeedback({ tone: "alert", message: "Could not reach the server — status was not changed" })
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }

  const decideStage = async (decision: "approve" | "reject") => {
    setPending(true)
    setFeedback({ tone: "status", message: `${decision === "approve" ? "Approving" : "Rejecting"} the current stage…` })
    try {
      const result = await decideReviewTaskStageAction(workspaceId, taskId, decision)
      if (!result.success) { const message = result.error || "Could not record that decision"; setFeedback({ tone: "alert", message }); toast.error(message); return }
      setFeedback({ tone: "status", message: decision === "approve" ? "Stage approved" : "Stage rejected" })
      toast.success(decision === "approve" ? "Stage approved" : "Rejected")
      router.refresh()
    } catch {
      setFeedback({ tone: "alert", message: "Could not reach the server — decision was not recorded" })
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }

  const startWorkflow = async (workflowId: string) => {
    if (!workflowId) return
    setPending(true)
    setFeedback({ tone: "status", message: "Starting approval workflow…" })
    try {
      const result = await startWorkflowOnReviewTaskAction(workspaceId, taskId, workflowId)
      if (!result.success) { const message = result.error || "Could not start that workflow"; setFeedback({ tone: "alert", message }); toast.error(message); return }
      setFeedback({ tone: "status", message: "Approval workflow started" })
      toast.success("Workflow started")
      router.refresh()
    } catch {
      setFeedback({ tone: "alert", message: "Could not reach the server — workflow was not started" })
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }

  const setAssignee = async (value: string) => {
    setPending(true)
    setFeedback({ tone: "status", message: "Saving assignee…" })
    try {
      const result = await assignReviewTaskAction(workspaceId, taskId, value || null)
      if (!result.success) { const message = result.error || "Could not assign"; setFeedback({ tone: "alert", message }); toast.error(message); return }
      setFeedback({ tone: "status", message: value ? "Assignee updated" : "Task unassigned" })
      router.refresh()
    } catch {
      setFeedback({ tone: "alert", message: "Could not reach the server — assignee was not changed" })
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }

  return <div className="space-y-4 rounded border p-4" aria-busy={pending}>
    {feedback && <p role={feedback.tone} aria-live={feedback.tone === "alert" ? "assertive" : "polite"} className={`text-sm ${feedback.tone === "alert" ? "text-red-600" : "text-slate-600"}`}>{feedback.message}</p>}
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Assignee</label>
      <select className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm" defaultValue={assigneeId ?? ""} disabled={pending} onChange={(event) => void setAssignee(event.target.value)}>
        <option value="">Unassigned</option>
        {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
    </div>
    {workflow ? (
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{workflow.name}</label>
        <p className="mt-1 text-sm text-slate-600">
          Stage {workflow.currentStageIndex + 1} of {workflow.stages.length}: {workflow.stages[workflow.currentStageIndex]?.name}
          {workflow.stages[workflow.currentStageIndex]?.requireOwner ? " (owner only)" : ""}
        </p>
        {status === "in_review" ? (
          workflow.canDecideCurrentStage ? (
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button type="button" disabled={pending} className="rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50" onClick={() => void decideStage("approve")}>Approve stage</button>
              <button type="button" disabled={pending} className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" onClick={() => void decideStage("reject")}>Reject</button>
            </div>
          ) : <p className="mt-1.5 text-xs text-indigo-700">Only a workspace owner can decide this stage.</p>
        ) : <p className="mt-1.5 text-xs font-medium capitalize text-slate-600">{status.replace("_", " ")}</p>}
      </div>
    ) : (
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {["open", "in_review", "approved", "rejected"].map((option) => (
            <button key={option} type="button" disabled={pending || status === option}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors ${status === option ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "hover:bg-slate-50"}`}
              onClick={() => void setStatus(option)}>
              {option.replace("_", " ")}
            </button>
          ))}
        </div>
        {availableWorkflows.length > 0 && (
          <div className="mt-2">
            <select className="w-full rounded-md border px-2.5 py-1.5 text-xs" disabled={pending} defaultValue="" onChange={(event) => void startWorkflow(event.target.value)}>
              <option value="" disabled>Start an approval workflow…</option>
              {availableWorkflows.map((wf) => <option key={wf.id} value={wf.id}>{wf.name} ({wf.stageCount} stage{wf.stageCount === 1 ? "" : "s"})</option>)}
            </select>
          </div>
        )}
      </div>
    )}
  </div>
}

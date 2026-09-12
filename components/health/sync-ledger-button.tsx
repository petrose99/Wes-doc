"use client"

import { syncLedgerTransactionsAction } from "@/app/(app)/workspaces/[workspaceId]/integration-connection-actions"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** Phase B: pulls fresh bills/expenses/bank transactions from the workspace's active accounting
 * connection into LedgerTransaction before the cleanup checks run against it — same manual-trigger
 * shape as RunChecksButton, since nothing schedules this automatically inside a request/response
 * cycle (the daily drain in app/api/internal/jobs/process/route.ts is the automatic path). Only
 * rendered when the health page found an active connection to sync. */
export function SyncLedgerButton({ workspaceId, connectionId }: { workspaceId: string; connectionId: string }) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: "status" | "alert"; message: string } | null>(null)
  return <div className="flex flex-col items-start gap-1.5">
    <Button type="button" variant="outline" size="sm" disabled={running} onClick={async () => {
      setRunning(true)
      setFeedback({ tone: "status", message: "Syncing ledger transactions…" })
      try {
        const result = await syncLedgerTransactionsAction(workspaceId, connectionId)
        if (!result.success) throw new Error(result.error)
        const synced = result.data?.synced ?? 0
        const message = `Ledger synced — ${synced} transaction${synced === 1 ? "" : "s"} up to date`
        setFeedback({ tone: "status", message })
        toast.success("Ledger synced")
        router.refresh()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not sync ledger transactions"
        setFeedback({ tone: "alert", message })
        toast.error(message)
      } finally {
        setRunning(false)
      }
    }}>
      <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
      {running ? "Syncing…" : "Sync ledger now"}
    </Button>
    {feedback && <p role={feedback.tone} aria-live={feedback.tone === "alert" ? "assertive" : "polite"} className={`text-xs ${feedback.tone === "alert" ? "text-red-600" : "text-slate-500"}`}>
      {feedback.message}
    </p>}
  </div>
}

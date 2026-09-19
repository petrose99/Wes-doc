"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { repairBigcapitalConnectionAction } from "@/app/(app)/workspaces/[workspaceId]/accounting-actions"
import {
  listExpenseAccountsAction,
  setDefaultExpenseAccountAction,
  syncAccountingEntitiesAction,
} from "@/app/(app)/workspaces/[workspaceId]/integration-connection-actions"
import { ArrowUpRight, CheckCircle2, CircleDot, Loader2, RefreshCw, ShieldAlert, Wallet } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

type Connection = {
  id: string
  externalTenantId: string | null
  tenantName: string | null
  status: string
  defaultExpenseAccountId: string | null
  defaultExpenseAccountName: string | null
  createdAt: Date
} | null

type ProvisionJob = { status: string; attempts: number; errorCode: string | null; nextAttemptAt: Date; updatedAt: Date } | null

const STATUS_LABEL: Record<string, string> = {
  active: "Connected",
  needs_reauth: "Needs reconnect",
  error: "Error",
  provisioning: "Provisioning…",
  not_started: "Not started",
}

/** Derives the card's display status from the connection + job pair. Explicitly covers "neither
 * exists yet" (not_started) as its own state — a workspace whose provisioning was never enqueued,
 * or whose enqueue silently failed (see models/workspaces.ts) — rather than lumping it into
 * "provisioning" with no job actually in flight and no way to start one. Only a `pending` job with
 * no connection is genuinely "in flight" — a `succeeded` job with no connection means the
 * connection was disconnected afterward (disconnectIntegrationAction doesn't touch the job row),
 * which needs the same repair affordance as a real failure, not a permanent spinner. */
function deriveStatus(connection: Connection, job: ProvisionJob): string {
  if (connection) return connection.status
  if (job?.status === "pending") return "provisioning"
  return job ? "error" : "not_started"
}

function ConnectionCard({ workspaceId, isOwner, connection, job, lastSyncedAt, entityCounts, onChanged, frame = "card" }: {
  workspaceId: string
  isOwner: boolean
  connection: Connection
  job: ProvisionJob
  lastSyncedAt: Date | null
  entityCounts: { accounts: number; vendors: number }
  onChanged: () => void
  /** "panel" (#248 → #252): the same behaviour inside an Admin Panel — no Card chrome, hairline
   * rules, the primary Open ledger at the top right. */
  frame?: "card" | "panel"
}) {
  const [pending, startTransition] = useTransition()
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: "status" | "alert"; message: string } | null>(null)

  const repair = () => {
    setFeedback({ tone: "status", message: "Starting connection provisioning…" })
    startTransition(async () => {
    const res = await repairBigcapitalConnectionAction(workspaceId)
      if (res.success) { setFeedback({ tone: "status", message: "Connection provisioning started" }); toast.success("Provisioning started"); onChanged() }
      else { const message = res.error || "Could not start provisioning"; setFeedback({ tone: "alert", message }); toast.error(message) }
    })
  }

  const sync = () => {
    if (!connection) return
    setFeedback({ tone: "status", message: "Syncing Finance accounts and vendors…" })
    startTransition(async () => {
      const res = await syncAccountingEntitiesAction(workspaceId, connection.id)
      if (res.success) { setFeedback({ tone: "status", message: "Finance accounts and vendors synced" }); toast.success("Synced"); onChanged() }
      else { const message = res.error || "Could not sync accounts"; setFeedback({ tone: "alert", message }); toast.error(message) }
    })
  }

  const loadAccounts = () => {
    if (!connection) return
    setLoadingAccounts(true)
    setFeedback({ tone: "status", message: "Loading Finance expense accounts…" })
    startTransition(async () => {
      const res = await listExpenseAccountsAction(workspaceId, connection.id)
      setLoadingAccounts(false)
      if (res.success) { setAccounts(res.data ?? []); setFeedback({ tone: "status", message: "Finance expense accounts loaded" }) }
      else { const message = res.error || "Could not load expense accounts"; setFeedback({ tone: "alert", message }); toast.error(message) }
    })
  }

  const onSelectAccount = (accountId: string) => {
    if (!connection) return
    const account = accounts?.find((a) => a.id === accountId)
    if (!account) return
    setFeedback({ tone: "status", message: `Saving ${account.name} as the default expense account…` })
    startTransition(async () => {
      const res = await setDefaultExpenseAccountAction(workspaceId, connection.id, account.id, account.name)
      if (res.success) { setFeedback({ tone: "status", message: `${account.name} is now the default expense account` }); onChanged() }
      else { const message = res.error || "Could not set the default account"; setFeedback({ tone: "alert", message }); toast.error(message) }
    })
  }

  const status = deriveStatus(connection, job)
  const needsRepair = status === "needs_reauth" || status === "error" || status === "not_started"
  const isActive = status === "active"

  const statusIcon = isActive
    ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    : needsRepair
      ? <ShieldAlert className="h-5 w-5 text-red-500" />
      : <Loader2 className="h-5 w-5 animate-spin text-slate-400" />

  const body = <>
        {feedback && (
          <p role={feedback.tone} aria-live={feedback.tone === "alert" ? "assertive" : "polite"} className={`rounded-md border px-3 py-2 text-sm ${feedback.tone === "alert" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {feedback.message}
          </p>
        )}
        <div className="flex items-center gap-4 rounded-lg border border-hairline bg-slate-50/50 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
            {statusIcon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">{connection?.tenantName || "Your organization"}</p>
            <p className={`mt-0.5 text-xs font-medium ${isActive ? "text-emerald-600" : needsRepair ? "text-red-700" : "text-slate-600"}`}>
              {STATUS_LABEL[status] ?? status}
            </p>
            {job?.errorCode && !isActive && <p className="mt-0.5 text-xs text-slate-600">Last error: {job.errorCode.replaceAll("_", " ")}</p>}
          </div>
          {isOwner && needsRepair && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={repair} className="shrink-0">
              {pending ? "Starting…" : status === "not_started" ? "Start provisioning" : "Repair connection"}
            </Button>
          )}
        </div>

        {isActive && connection && (
          <>
            <div className="border-t border-hairline pt-4">
              <div className="flex items-center gap-4 rounded-lg border border-hairline bg-slate-50/50 px-4 py-3">
                <div className="flex flex-1 items-center gap-6">
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums text-slate-800">{entityCounts.accounts}</p>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">Accounts</p>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums text-slate-800">{entityCounts.vendors}</p>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">Suppliers</p>
                  </div>
                  <span className="ml-auto text-xs text-slate-600" suppressHydrationWarning>
                    {lastSyncedAt ? `Last synced ${lastSyncedAt.toLocaleDateString()}, ${lastSyncedAt.toLocaleTimeString()}` : "Not yet synced"}
                  </span>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={sync} className="shrink-0 gap-1.5">
                  <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
                  Sync now
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-hairline px-4 py-3">
              <Wallet className="h-4 w-4 shrink-0 text-slate-400" />
              <Label htmlFor="default-expense-account" className="shrink-0 text-sm text-slate-600">Default expense account</Label>
              {accounts === null ? (
                <Button type="button" size="sm" variant="outline" disabled={loadingAccounts} onClick={loadAccounts} className="ml-auto">
                  {connection.defaultExpenseAccountName || (loadingAccounts ? "Loading…" : "Choose account")}
                </Button>
              ) : (
                <select
                  id="default-expense-account"
                  className="ml-auto rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-400"
                  defaultValue={connection.defaultExpenseAccountId ?? ""}
                  disabled={pending}
                  onChange={(e) => onSelectAccount(e.target.value)}
                >
                  <option value="" disabled>Select an account</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </div>
          </>
        )}
  </>
  if (frame === "panel") {
    return <div className="space-y-4" aria-busy={pending}>
      {isActive && connection?.externalTenantId && (
        <a href={`/api/accounting/session?workspaceId=${workspaceId}`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">
          Open ledger <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
      )}
      {body}
    </div>
  }
  return (
    <Card className="overflow-hidden" aria-busy={pending}>
      <div className={`h-1 ${isActive ? "bg-emerald-500" : needsRepair ? "bg-red-400" : "bg-slate-200"}`} />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-slate-400" />
          Connection
        </CardTitle>
        <CardDescription>Every workspace gets its own isolated accounting organization, created automatically — nothing to connect by hand.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{body}</CardContent>
    </Card>
  )
}

/** #248 → #252: Admin › Integrations › Ledger connection — Finance's ConnectionCard behaviour
 * (status line, Sync now, default expense account, Open ledger) inside an Admin Panel. */
export function LedgerConnectionPanel({ workspaceId, isOwner, connection, job, lastSyncedAt, entityCounts }: {
  workspaceId: string
  isOwner: boolean
  connection: Connection
  job: ProvisionJob
  lastSyncedAt: Date | null
  entityCounts: { accounts: number; vendors: number }
}) {
  const router = useRouter()
  return <ConnectionCard frame="panel" workspaceId={workspaceId} isOwner={isOwner} connection={connection} job={job} lastSyncedAt={lastSyncedAt} entityCounts={entityCounts} onChanged={() => router.refresh()} />
}

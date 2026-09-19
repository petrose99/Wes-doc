"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { EligibilityStrip, ItemizedRecapTable, type ItemizedRecord } from "@/components/typed-destinations/bulk-approve-receipt"
import { listExpenseAccountsAction } from "@/app/(app)/workspaces/[workspaceId]/integration-connection-actions"
import { postSelectedDocumentsAction, type SelectionPostOutcome } from "@/app/(app)/workspaces/[workspaceId]/post-selected-documents-actions"

/** #281 (map #226, #248): the bulk "Post" confirm dialog, shared by the Invoice, Receipt and Bank
 * Statement queues (spec.md §3.1). Reuses `ItemizedRecapTable`/`EligibilityStrip` — Payments'
 * shipped pattern — rather than a bespoke table. The eligibility shown here is the client's guess
 * (the caller's `eligibleIds`, same limited signal Approve's confirm already uses); the button is
 * never gated on it (§3) — the server re-resolves on confirm and a row it rejects comes back as
 * its own outcome with a reason, never a silent drop (H9). The account-select column applies
 * uniformly to every doc type: `pushDocumentToConnection`'s account resolution (mappings →
 * category map → default) never branches on docType, so there is no receipt-only restriction. */
export function PostConfirmDialog({ open, onClose, workspaceId, connectionId, records, eligibleIds, onPosted }: {
  open: boolean
  onClose: () => void
  workspaceId: string
  /** Null when no ledger connection is active — the connection-failure band (spec.md §6, a later
   * build step) is the queue-level signal for that; here the dialog still opens (never a silent
   * no-op, H9) but every row reads ineligible and Post stays disabled. */
  connectionId: string | null
  records: ItemizedRecord[]
  /** The caller's client-side eligibility guess (ids only) — same limited signal Approve's own
   * confirm dialog uses (blockedByCheck), not a round trip to the server. */
  eligibleIds: string[]
  onPosted: (outcome: { posted: number; failed: number; results: SelectionPostOutcome[] }) => void
}) {
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eligibleSet = new Set(connectionId ? eligibleIds : [])

  // Best-effort account list for the optional override column — quiet on failure since the
  // server already resolves a sensible default (mappings → category map → connection default)
  // with no override supplied.
  useEffect(() => {
    if (!open || !connectionId) { setAccounts(null); return }
    let cancelled = false
    listExpenseAccountsAction(workspaceId, connectionId).then((res) => {
      if (!cancelled && res.success) setAccounts(res.data ?? [])
    })
    return () => { cancelled = true }
  }, [open, connectionId, workspaceId])

  const close = () => { if (busy) return; onClose(); setOverrides({}); setError(null) }

  const confirm = async () => {
    if (!connectionId || eligibleSet.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const result = await postSelectedDocumentsAction(workspaceId, connectionId, records.map((r) => r.id), overrides)
      if (!result.success || !result.data) { setError(result.error ?? "Could not post these documents"); return }
      const { posted, failed, results } = result.data
      const total = results.length
      const message = failed === 0 ? `Posted ${posted} document${posted === 1 ? "" : "s"}`
        : posted === 0 ? "0 documents posted — see Ledger mark for reasons"
        : `Posted ${posted} of ${total} documents`
      if (failed === 0) toast.success(message); else toast.warning(message)
      onPosted({ posted, failed, results })
      close()
    } catch {
      setError("Could not reach the server. Nothing was posted — try again.")
    } finally {
      setBusy(false)
    }
  }

  const tableRecords: ItemizedRecord[] = records.map((r) => eligibleSet.has(r.id) ? r : { ...r, struck: true, note: r.note ?? (connectionId ? "Selection may be stale — recheck after posting" : "No ledger connected") })

  return <Dialog open={open} onClose={close} title="Post to ledger" width="max-w-2xl">
    <div className="space-y-3 px-5 py-4">
      <EligibilityStrip eligible={eligibleSet.size} total={records.length} label="Eligible to post" />
      <ItemizedRecapTable records={tableRecords}
        extraColumn={accounts && accounts.length > 0 ? {
          header: "Account",
          render: (record) => eligibleSet.has(record.id)
            ? <select aria-label={`Expense account for ${record.vendor ?? record.number ?? "this document"}`}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-emerald-400"
                value={overrides[record.id] ?? ""} onChange={(e) => setOverrides((prev) => ({ ...prev, [record.id]: e.target.value }))}>
                <option value="">Default</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            : <span className="text-xs text-slate-400">—</span>,
        } : undefined} />
      <p className="text-sm font-medium text-slate-800">This sends the reviewed data to the ledger. Nothing un-posts.</p>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </div>
    <div className="flex justify-end gap-2 border-t px-5 py-3">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
      <Button type="button" size="sm" disabled={busy || eligibleSet.size === 0} onClick={() => void confirm()}>
        {busy ? "Posting…" : eligibleSet.size === 0 ? "No eligible documents in this selection" : `Post ${eligibleSet.size} document${eligibleSet.size === 1 ? "" : "s"}`}
      </Button>
    </div>
  </Dialog>
}

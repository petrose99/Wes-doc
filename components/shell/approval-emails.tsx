"use client"

import { useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { useOnlineStatus } from "@/lib/client/use-online-status"
import { getApprovalNoticeEmailsAction, setApprovalNoticeEmailsAction } from "@/app/(app)/workspaces/[workspaceId]/actions"

/** #271 spec §4 — "Approval emails", the per-person switch behind the Approval notice. One
 * control, two homes: the desktop account-menu dialog and the phone Account page's panel. The
 * switch saves on change (a single boolean with immediate feedback, no draft to lose); the
 * status and error lines sit at the control, and a failed save reverts the switch. */

const OPEN_EVENT = "docubite:open-approval-emails"
export const APPROVAL_EMAILS_OFFLINE_REASON = "You're offline — the change can't be saved yet"
export const APPROVAL_EMAILS_SAVE_ERROR = "Couldn't save this. Check your connection and try again."

export function openApprovalEmailsDialog() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function ApprovalEmailsControl({ workspaceId, initial, onSaved, switchId = "approval-emails-switch" }: {
  workspaceId: string
  initial: boolean
  /** Called with the saved value so the host can refresh whatever else shows it (menu suffix). */
  onSaved?: (enabled: boolean) => void
  switchId?: string
}) {
  const [enabled, setEnabled] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const online = useOnlineStatus()
  const helpId = useId()
  const statusId = useId()
  useEffect(() => { setEnabled(initial) }, [initial])

  const change = async (next: boolean) => {
    if (saving) return
    const previous = enabled
    setEnabled(next)
    setError(null)
    setSaving(true)
    try {
      const result = await setApprovalNoticeEmailsAction(workspaceId, next)
      if (!result.success || !result.data) throw new Error(result.error || "save_failed")
      setEnabled(result.data.enabled)
      onSaved?.(result.data.enabled)
    } catch {
      setEnabled(previous)
      setError(APPROVAL_EMAILS_SAVE_ERROR)
    } finally {
      setSaving(false)
    }
  }

  return <div>
    <div className="flex min-h-11 items-center justify-between gap-4">
      <label htmlFor={switchId} className="text-sm font-medium text-slate-800">Email me when an Approval needs me.</label>
      <Switch id={switchId} checked={enabled} onCheckedChange={(next) => void change(next)} label="Approval emails" describedBy={helpId} busy={saving} disabled={!online} />
    </div>
    <p id={helpId} className="mt-1 max-w-[52ch] text-[13px] leading-relaxed text-slate-500">
      {enabled ? "One email an hour at most, only for Approvals you can decide." : "You'll still see them under Approvals. Nothing is emailed."}
    </p>
    <p id={statusId} role="status" aria-live="polite" className="mt-1 min-h-5 text-[13px] text-slate-500">
      {saving ? "Saving…" : !online ? APPROVAL_EMAILS_OFFLINE_REASON : ""}
    </p>
    {error && <p role="alert" className="text-[13px] text-red-700">{error}</p>}
  </div>
}

/** Mounted once in `Sidebar`; the account-menu row opens it (menu closed first, so the dialog's
 * opener — and Escape's return target — is the chip, `#account-menu-trigger`). Reads the saved
 * value on open (pre-flight B2) rather than trusting the prop the layout rendered. */
export function ApprovalEmailsDialog({ workspaceId, initial }: { workspaceId: string; initial: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(initial)
  useEffect(() => { setValue(initial) }, [initial])

  useEffect(() => {
    const onOpen = () => {
      setOpen(true)
      void getApprovalNoticeEmailsAction().then((result) => { if (result.success && result.data) setValue(result.data.enabled) }).catch(() => undefined)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  return <Dialog open={open} title="Approval emails" onClose={() => setOpen(false)} initialFocus="#approval-emails-switch">
    <ApprovalEmailsControl workspaceId={workspaceId} initial={value} onSaved={(enabled) => { setValue(enabled); router.refresh() }} />
    <div className="mt-4 flex justify-end border-t border-hairline pt-4">
      <button type="button" onClick={() => setOpen(false)}
        className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 md:min-h-9 max-md:w-full max-md:justify-center">
        Done
      </button>
    </div>
  </Dialog>
}

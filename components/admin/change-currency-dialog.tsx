"use client"

import { changeCompanyCurrencyAction } from "@/app/(app)/workspaces/[workspaceId]/admin/companies/actions"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { currencyLockEvent } from "@/lib/admin/companies"
import { useState, useTransition } from "react"
import { toast } from "sonner"

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

function unpostedLine(count: number, to: string): string {
  if (count === 0) return "No unposted documents need re-converting."
  return `${count} unposted ${plural(count, "document", "documents")} will be re-converted to ${to}.`
}

function successToast(to: string, count: number, requeued: number): string {
  const parts = [`Company currency changed to ${to}.`]
  if (count > 0) parts.push(`${count} ${plural(count, "document", "documents")} re-converted.`)
  if (requeued > 0) parts.push(`${requeued} ${plural(requeued, "bill", "bills")} waiting on the ledger currency will be posted again.`)
  return parts.join(" ")
}

/** #457 spec §5.3, §9.3–9.4: the one confirm for a Company currency change, opened from the
 * Companies pane's "Change" and the connection card's "Switch this company to ZAR". Not
 * destructive — LSL and ZAR are pegged 1:1 and it can be changed back until the currency locks.
 * The lock, the pair and a push in flight are re-checked on the server; each refusal is a line in
 * the dialog, never a toast, so the reason sits next to the button it disabled. */
export function ChangeCurrencyDialog({ open, workspaceId, companyId, from, to, unpostedCount, onClose, onChanged, restoreFocusTo }: {
  open: boolean
  workspaceId: string
  companyId: string
  from: string
  to: string
  unpostedCount: number
  onClose: () => void
  /** After a change, or after Cancel on a company found locked: the caller refreshes its view. */
  onChanged: () => void
  restoreFocusTo?: React.RefObject<HTMLElement | null>
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  const close = () => {
    setError(null)
    setLocked(false)
    onClose()
    if (locked) onChanged()
  }

  const confirm = () => startTransition(async () => {
    setError(null)
    const result = await changeCompanyCurrencyAction(workspaceId, companyId, to).catch(() => null)
    if (result?.success && result.data) {
      toast.success(successToast(to, result.data.count, result.data.requeued))
      onClose()
      onChanged()
      return
    }
    if (result?.error === "company_currency_locked") {
      const lock = result.data?.lock
      setLocked(true)
      setError(lock?.locked
        ? `Couldn't change it: the company was locked when ${currencyLockEvent(lock)}.`
        : "Couldn't change it: the company currency is locked because something was already posted in it.")
      return
    }
    if (result?.error === "company_currency_push_in_flight") { setError("A bill is being posted right now. Try again in a minute."); return }
    setError("Couldn't change the currency. Nothing was changed. Try again.")
  })

  return <ConfirmDialog
    open={open}
    title={`Change the company currency to ${to}?`}
    description={`${from} and ${to} are pegged 1:1, so amounts and approval limits keep their values. ${unpostedLine(unpostedCount, to)}`}
    confirmLabel={pending ? "Changing…" : `Change to ${to}`}
    busy={pending}
    confirmDisabled={locked}
    onConfirm={confirm}
    onCancel={close}
    restoreFocusTo={restoreFocusTo}
  >
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </ConfirmDialog>
}

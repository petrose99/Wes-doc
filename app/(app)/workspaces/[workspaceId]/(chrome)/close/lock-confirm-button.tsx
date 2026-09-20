"use client"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useState, useTransition } from "react"

/** Lock/relock a close period is exactly the "action that locks or publishes data" case
 * Wayfinder decision #115 requires a preflight confirmation for: it freezes the jurisdiction
 * pack + workspace-mode snapshot and makes every item immutable until a reasoned Reopen.
 * Mirrors the accounting-dashboard ledger-push confirm — a ConfirmDialog with the affected
 * scope listed, not a bare form submit. */
export function LockConfirmButton({ action, triggerLabel, periodLabel, relock, items, hardBlockingCount }: {
  action: () => Promise<void>
  triggerLabel: string
  periodLabel: string
  relock: boolean
  items: { title: string; state: string }[]
  hardBlockingCount: number
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const unsigned = items.filter((item) => item.state !== "signed" && item.state !== "override")

  const description = hardBlockingCount > 0
    ? `${hardBlockingCount} hard-blocking exception${hardBlockingCount === 1 ? "" : "s"} against this company's bills will still block the lock — this attempt will be rejected.`
    : unsigned.length > 0
      ? `${unsigned.length} item${unsigned.length === 1 ? "" : "s"} not yet signed off or overridden. Locking snapshots the jurisdiction pack and company mode; changing anything afterward requires Reopen with a reason.`
      : "Locking snapshots the jurisdiction pack and company mode. Changing anything afterward requires Reopen with a reason."

  return (
    <>
      <button
        type="button"
        className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      <ConfirmDialog
        open={open}
        busy={pending}
        title={`${relock ? "Relock" : "Lock"} ${periodLabel}?`}
        description={description}
        confirmLabel={pending ? (relock ? "Relocking…" : "Locking…") : (relock ? "Relock period" : "Lock period")}
        onConfirm={() => {
          if (pending) return
          startTransition(async () => {
            await action()
            setOpen(false)
          })
        }}
        onCancel={() => { if (!pending) setOpen(false) }}
      >
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          {items.map((item) => (
            <li key={item.title} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{item.title}</span>
              <span className={
                item.state === "signed" ? "shrink-0 font-medium text-emerald-700"
                : item.state === "override" ? "shrink-0 font-medium text-amber-700"
                : "shrink-0 font-medium text-slate-400"
              }>
                {item.state}
              </span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  )
}

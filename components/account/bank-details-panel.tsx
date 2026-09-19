"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Consequence } from "@/components/admin/admin-ui"
import { actionErrorText } from "@/lib/admin/users"
import { saveMemberBankDetailsAction } from "@/app/(app)/workspaces/[workspaceId]/admin/users/actions"

type BankDraft = { bankName: string; accountNumber: string; branchCode: string }
type BankSummary = { bankName: string; lastFour: string } | null

function validateBank(draft: BankDraft): Partial<Record<keyof BankDraft, string>> {
  const errors: Partial<Record<keyof BankDraft, string>> = {}
  if (!draft.bankName.trim()) errors.bankName = "Bank name is needed"
  const digits = draft.accountNumber.replace(/\s+/g, "")
  if (!/^\d{6,20}$/.test(digits)) errors.accountNumber = "6–20 digits"
  if (draft.branchCode.trim().length < 3 || draft.branchCode.trim().length > 10) errors.branchCode = "3–10 characters"
  return errors
}

function BankField({ id, label, value, error, disabled, inputMode, onChange }: {
  id: string; label: string; value: string; error?: string; disabled: boolean; inputMode?: "numeric"; onChange: (value: string) => void
}) {
  return <div className="flex flex-col gap-1">
    <label htmlFor={id} className="text-[13px] text-slate-600">{label}</label>
    <input id={id} value={value} disabled={disabled} inputMode={inputMode} autoComplete="off" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full max-w-[20rem] rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50" />
    {error && <p id={`${id}-error`} role="alert" className="text-[13px] text-red-700">{error}</p>}
  </div>
}

/** #295 spec §5: self-service Bank details on the Account page — same field/edit-row pattern,
 * explicit-Save grammar (#252) and inline failure + Retry as the admin panel's `BankField`
 * (components/admin/user-detail.tsx), scoped to the current user's own membership via
 * `saveMemberBankDetailsAction`, which already authorises a caller acting on their own
 * `userId` (actions.ts:186) — no separate self-service action needed. B2: `router.refresh()`
 * re-reads the summary line in the same tick as the save. */
export function BankDetailsPanel({ workspaceId, userId, bank }: { workspaceId: string; userId: string; bank: BankSummary }) {
  const router = useRouter()
  const [draft, setDraft] = useState<BankDraft | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof BankDraft, string>>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  const bankLine = bank ? `${bank.bankName} · ····${bank.lastFour}` : null

  const submit = async (details: BankDraft | null) => {
    setSaving(true); setSaveError(null)
    const result = await saveMemberBankDetailsAction(workspaceId, {
      userId, workspaceId,
      details: details ? { bankName: details.bankName.trim(), accountNumber: details.accountNumber.replace(/\s+/g, ""), branchCode: details.branchCode.trim() } : null,
    })
    setSaving(false)
    if (!result.success) {
      const code = result.error ?? "bank_failed"
      if (code === "invalid_bank_details") setErrors({ accountNumber: actionErrorText(code) })
      setSaveError(code === "bank_failed" ? "Couldn't save. Your entries are still here — try again." : actionErrorText(code))
      return false
    }
    setDraft(null); setErrors({}); setSaveError(null)
    router.refresh()
    toast.success(details ? "Bank details saved." : "Bank details removed.")
    return true
  }

  if (draft) {
    return <div className="space-y-3">
      <BankField id="bank-name" label="Bank name" value={draft.bankName} error={errors.bankName} disabled={saving} onChange={(v) => setDraft({ ...draft, bankName: v })} />
      <BankField id="bank-account" label="Account number" value={draft.accountNumber} error={errors.accountNumber} disabled={saving} inputMode="numeric" onChange={(v) => setDraft({ ...draft, accountNumber: v })} />
      <BankField id="bank-branch" label="Branch code" value={draft.branchCode} error={errors.branchCode} disabled={saving} onChange={(v) => setDraft({ ...draft, branchCode: v })} />
      <Consequence>Used only in payment files for your claims. Shown as bank and last four digits everywhere else.</Consequence>
      {saveError && <p role="alert" className="text-[13px] text-red-700">{saveError}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={async () => {
          const found = validateBank(draft)
          setErrors(found)
          if (Object.keys(found).length) return
          await submit(draft)
        }}>{saving ? "Saving…" : "Save"}</Button>
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { setDraft(null); setErrors({}); setSaveError(null) }}>Cancel</Button>
      </div>
    </div>
  }

  return <div className="space-y-2">
    <p className="text-sm text-slate-900">{bankLine ?? <span className="text-slate-600">None yet — needed before a reimbursement can be paid.</span>}</p>
    <div className="flex gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => { setDraft({ bankName: "", accountNumber: "", branchCode: "" }); setErrors({}); setSaveError(null) }}>{bankLine ? "Change…" : "Add bank details…"}</Button>
      {bankLine && <Button type="button" size="sm" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setConfirmingRemove(true)}>Remove</Button>}
    </div>
    <ConfirmDialog
      open={confirmingRemove}
      title="Remove your bank details?"
      description="Claims already in a payment batch keep the details they were exported with. New claims will read “Needs bank details” on Bill Pay until you add them again."
      confirmLabel={removing ? "Removing…" : "Remove"}
      destructive
      busy={removing}
      onCancel={() => setConfirmingRemove(false)}
      onConfirm={async () => {
        setRemoving(true)
        const ok = await submit(null)
        setRemoving(false)
        if (ok) setConfirmingRemove(false)
      }}
    />
  </div>
}

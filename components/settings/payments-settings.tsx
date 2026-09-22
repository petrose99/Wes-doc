"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { payerAccountLabel } from "@/lib/payments/payer-account-label"
import { formatTerms } from "@/lib/payments/terms"
import type { PayerAccountRow } from "@/models/payer-accounts"
import type { ActionState } from "@/lib/actions"

/** #229 Q4/Q5 (#251): Settings › Payments. Payer accounts (name, bank, last four, currency,
 * default) and each supplier's payment terms, discount and bank account — the row Bill Pay's
 * "Needs bank details" links to. Owner writes; members read. */

const INPUT = "h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-50"
const LABEL = "block text-xs font-medium text-slate-700"

export function PayerAccountsSettings({ workspaceId, accounts, owner, baseCurrency, actions }: {
  workspaceId: string
  accounts: PayerAccountRow[]
  owner: boolean
  baseCurrency: string
  actions: {
    create: (workspaceId: string, formData: FormData) => Promise<ActionState<null>>
    update: (workspaceId: string, accountId: string, formData: FormData) => Promise<ActionState<null>>
    setDefault: (workspaceId: string, accountId: string) => Promise<ActionState<null>>
    archive: (workspaceId: string, accountId: string) => Promise<ActionState<null>>
  }
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<PayerAccountRow | null>(null)
  const [pending, start] = useTransition()
  const run = (label: string, fn: () => Promise<ActionState<null>>) => start(async () => {
    const result = await fn()
    if (!result.success) toast.error(result.error ?? `Couldn't ${label}`); else { toast.success(`${label[0].toUpperCase()}${label.slice(1)}`); setEditing(null); setArchiving(null) }
  })

  return <div className="space-y-4">
    {accounts.length === 0
      ? <p className="text-sm text-slate-700">No payer account yet. A payment batch needs one to say which bank portal its file belongs to.</p>
      : <ul className="divide-y divide-hairline-soft">
        {accounts.map((account) => <li key={account.id} className="px-3 py-2">
          {editing === account.id
            ? <PayerAccountForm key={account.id} account={account} baseCurrency={baseCurrency} busy={pending} onCancel={() => setEditing(null)}
              onSubmit={(formData) => run("account saved", () => actions.update(workspaceId, account.id, formData))} />
            : <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium text-slate-900">{payerAccountLabel(account)}</span>
              {account.bankName && <span className="text-slate-600">{account.bankName}</span>}
              <span className="text-slate-600">{account.currencyCode}</span>
              {account.isDefault && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Default</span>}
              {owner && <span className="ml-auto flex gap-1">
                {!account.isDefault && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run("default set", () => actions.setDefault(workspaceId, account.id))}>Make default</Button>}
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(account.id)}>Edit</Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setArchiving(account)}>Archive</Button>
              </span>}
            </div>}
        </li>)}
      </ul>}
    {owner && (editing === "new"
      ? <PayerAccountForm baseCurrency={baseCurrency} busy={pending} onCancel={() => setEditing(null)} onSubmit={(formData) => run("account added", () => actions.create(workspaceId, formData))} />
      : <Button type="button" size="sm" variant="outline" onClick={() => setEditing("new")}>Add payer account</Button>)}
    <ConfirmDialog open={archiving !== null} busy={pending} title={`Archive ${archiving ? payerAccountLabel(archiving) : "this account"}?`}
      description="Existing batches keep this label; new batches can't pay from it. Nothing about the bank account itself changes."
      confirmLabel="Archive" onConfirm={() => { if (archiving) run("account archived", () => actions.archive(workspaceId, archiving.id)) }} onCancel={() => setArchiving(null)} />
  </div>
}

function PayerAccountForm({ account, baseCurrency, busy, onCancel, onSubmit }: { account?: PayerAccountRow; baseCurrency: string; busy: boolean; onCancel: () => void; onSubmit: (formData: FormData) => void }) {
  return <form className="grid gap-3 border-y border-slate-200 py-3 sm:grid-cols-[2fr_2fr_1fr_1fr]" onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)) }}>
    <label className={LABEL}>Account name<input name="name" defaultValue={account?.name ?? ""} required maxLength={60} placeholder="Operating account" className={`${INPUT} mt-1`} /></label>
    <label className={LABEL}>Bank<input name="bankName" defaultValue={account?.bankName ?? ""} maxLength={60} placeholder="Standard Bank" className={`${INPUT} mt-1`} /></label>
    <label className={LABEL}>Last four digits<input name="lastFour" defaultValue={account?.lastFour ?? ""} inputMode="numeric" maxLength={4} pattern="[0-9]{0,4}" placeholder="4321" className={`${INPUT} mt-1 tabular-nums`} /></label>
    <label className={LABEL}>Currency<input name="currencyCode" defaultValue={account?.currencyCode ?? baseCurrency} required maxLength={3} pattern="[A-Za-z]{3}" className={`${INPUT} mt-1 uppercase`} /></label>
    <div className="flex items-center justify-between gap-2 sm:col-span-4">
      {!account ? <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="isDefault" className="h-4 w-4 rounded border-slate-300 accent-emerald-700" />Make this the default</label> : <span />}
      <span className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : account ? "Save" : "Add account"}</Button>
      </span>
    </div>
  </form>
}

export type SupplierPaymentsRow = {
  id: string
  name: string
  paymentTermsDays: number | null
  earlyPaymentDiscountPercent: number | null
  earlyPaymentDiscountDays: number | null
  account: string | null
  branchCode: string | null
  documentCount: number
}

export function SupplierPaymentsSettings({ workspaceId, suppliers, owner, action }: {
  workspaceId: string
  suppliers: SupplierPaymentsRow[]
  owner: boolean
  action: (workspaceId: string, supplierId: string, formData: FormData) => Promise<ActionState<null>>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (suppliers.length === 0) return <p className="text-sm text-slate-700">No suppliers yet. They appear here once an invoice names one.</p>
  return <ul className="divide-y divide-hairline-soft">
    {suppliers.map((supplier) => {
      const terms = formatTerms({ netDays: supplier.paymentTermsDays, discountPercent: supplier.earlyPaymentDiscountPercent, discountDays: supplier.earlyPaymentDiscountDays })
      return <li key={supplier.id} id={`supplier-${supplier.id}`} className="px-3 py-2 target:bg-emerald-50/60">
        {editing === supplier.id
          ? <form className="grid gap-3 py-2 sm:grid-cols-3" onSubmit={(event) => {
            event.preventDefault(); const formData = new FormData(event.currentTarget)
            start(async () => { const result = await action(workspaceId, supplier.id, formData); if (!result.success) toast.error(result.error ?? "Couldn't save the supplier"); else { toast.success(`${supplier.name} saved`); setEditing(null) } })
          }}>
            <p className="text-sm font-medium text-slate-900 sm:col-span-3">{supplier.name}</p>
            <label className={LABEL}>Net days<input name="paymentTermsDays" type="number" min={0} step={1} defaultValue={supplier.paymentTermsDays ?? ""} placeholder="30" className={`${INPUT} mt-1 tabular-nums`} /></label>
            <label className={LABEL}>Early-payment discount %<input name="earlyPaymentDiscountPercent" type="number" min={0} max={99.99} step={0.01} defaultValue={supplier.earlyPaymentDiscountPercent ?? ""} placeholder="2" className={`${INPUT} mt-1 tabular-nums`} /></label>
            <label className={LABEL}>Discount days<input name="earlyPaymentDiscountDays" type="number" min={0} step={1} defaultValue={supplier.earlyPaymentDiscountDays ?? ""} placeholder="10" className={`${INPUT} mt-1 tabular-nums`} /></label>
            <label className={`${LABEL} sm:col-span-2`}>Bank account number<input name="account" defaultValue={supplier.account ?? ""} maxLength={34} placeholder="Account or IBAN the payment file pays to" className={`${INPUT} mt-1 tabular-nums`} /></label>
            <label className={LABEL}>Branch code<input name="branchCode" defaultValue={supplier.branchCode ?? ""} maxLength={12} className={`${INPUT} mt-1 tabular-nums`} /></label>
            <div className="flex justify-end gap-2 sm:col-span-3">
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            </div>
          </form>
          : <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium text-slate-900">{supplier.name}</span>
            <span className="tabular-nums text-slate-700">Terms {terms}</span>
            {supplier.account
              ? <span className="text-slate-600">Account ····{supplier.account.slice(-4)}</span>
              : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Needs bank details</span>}
            <span className="text-xs text-slate-500">{supplier.documentCount} document{supplier.documentCount === 1 ? "" : "s"}</span>
            {owner && <Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={pending} onClick={() => setEditing(supplier.id)}>Edit</Button>}
          </div>}
      </li>
    })}
  </ul>
}

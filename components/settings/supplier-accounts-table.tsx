"use client"

import { forgetSupplierAccountRuleAction } from "@/app/(app)/workspaces/[workspaceId]/integration-connection-actions"
import {
  checkAffectedByRuleChangeAction,
  leaveAllAffectedByRuleAction,
  type AffectedByRuleChange,
} from "@/app/(app)/workspaces/[workspaceId]/account-correction-actions"
import { AccountCorrectionDialog } from "@/components/integrations/account-correction-dialog"
import { Input } from "@/components/ui/input"
import type { SupplierAccountRuleRow } from "@/models/supplier-account-rules"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

const FILTER_THRESHOLD = 20

/** #430 Screen 3 — keyed by `SupplierAccountRule.supplierName` (the rules table's own unique key),
 * one entry per supplier still carrying posted/paid bills on an account other than the rule's
 * current one. Server-resolved account name travels with the count so the row never needs its own
 * fetch just to render "still on {old account name}". */
export type SupplierAccountReminder = { oldAccountExternalId: string; oldAccountName: string; count: number }

/** Accounting page's learned-supplier table (#429 / ADR 0011): one row per supplier whose account
 * was learned from an approved document's largest line. Layout follows
 * CategoryAccountMappingTable's precedent (native table, no new component for the filter box). */
export function SupplierAccountsTable({ workspaceId, connectionId, rules, accountLabels, defaultAccountName, providerLabel, isOwner, reminders }: {
  workspaceId: string
  connectionId: string
  rules: SupplierAccountRuleRow[]
  /** externalId → { label, archived } — from the connection's synced AccountingEntity rows. */
  accountLabels: Record<string, { label: string; archived: boolean }>
  /** The connection's Default account name — what an archived supplier account falls back to. */
  defaultAccountName: string | null
  providerLabel: string
  isOwner: boolean
  /** #430 Screen 3 reminders, keyed by supplierName. Empty/absent for a supplier with nothing
   * outstanding — most rows, most of the time. */
  reminders: Record<string, SupplierAccountReminder>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState("")
  const [review, setReview] = useState<{ rule: SupplierAccountRuleRow; reminder: SupplierAccountReminder; data: AffectedByRuleChange } | null>(null)

  const openReview = (rule: SupplierAccountRuleRow, reminder: SupplierAccountReminder) => startTransition(async () => {
    const res = await checkAffectedByRuleChangeAction(workspaceId, connectionId, reminder.oldAccountExternalId, rule.accountExternalId)
    if (res.success && res.data) setReview({ rule, reminder, data: res.data })
    else if (res.success) { toast.success("Already up to date — nothing left to review"); router.refresh() }
    else toast.error(res.error || "Could not load those bills")
  })

  const leaveThemForRule = (rule: SupplierAccountRuleRow, reminder: SupplierAccountReminder) => startTransition(async () => {
    const res = await leaveAllAffectedByRuleAction(workspaceId, connectionId, reminder.oldAccountExternalId)
    if (res.success) { toast.success(`Left ${rule.supplierName}'s ${reminder.count} bill${reminder.count === 1 ? "" : "s"} on ${reminder.oldAccountName}`); router.refresh() }
    else toast.error(res.error || "Could not leave those bills")
  })

  const visible = useMemo(
    () => (filter.trim() ? rules.filter((r) => r.supplierName.toLowerCase().includes(filter.trim().toLowerCase())) : rules),
    [rules, filter],
  )

  const forget = (ruleId: string, supplierName: string) => startTransition(async () => {
    const res = await forgetSupplierAccountRuleAction(workspaceId, connectionId, ruleId)
    if (res.success) { toast.success(`Forgot ${supplierName}'s usual account`); router.refresh() }
    else toast.error(res.error || "Could not forget this supplier's account")
  })

  if (rules.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Supplier accounts fill in as documents get approved — the account of the largest line becomes that supplier's usual.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="max-w-prose text-sm text-slate-600">
        Learned from each supplier&rsquo;s most recently approved document. Forget removes the rule;
        the next approval for that supplier learns a new one.
      </p>
      {rules.length > FILTER_THRESHOLD && (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter suppliers…"
          aria-label="Filter suppliers"
          className="max-w-xs"
        />
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-slate-600">
            <th className="pb-2 font-medium">Supplier</th>
            <th className="pb-2 font-medium">Usual account</th>
            <th className="pb-2 font-medium">Last used</th>
            {isOwner && <th className="pb-2 w-16" />}
          </tr>
        </thead>
        <tbody>
          {visible.map((rule) => {
            const account = accountLabels[rule.accountExternalId]
            const reminder = reminders[rule.supplierName]
            return (
              <tr key={rule.id} className="border-b border-hairline-soft last:border-0 align-top">
                <td className="py-2">{rule.supplierName}</td>
                <td className="py-2">
                  {account?.archived
                    ? <>{defaultAccountName ?? account.label} <span className="text-slate-600">({rule.supplierName}&rsquo;s account was archived in {providerLabel})</span></>
                    : (account?.label ?? rule.accountExternalId)}
                  {isOwner && reminder && (
                    <p className="mt-1 text-xs text-amber-700">
                      {reminder.count} posted bill{reminder.count === 1 ? "" : "s"} still on {reminder.oldAccountName} ·{" "}
                      <button type="button" disabled={pending} onClick={() => openReview(rule, reminder)}
                        className="font-medium underline-offset-2 hover:underline">
                        Review
                      </button>
                      {" "}<button type="button" disabled={pending} onClick={() => leaveThemForRule(rule, reminder)}
                        className="font-medium underline-offset-2 hover:underline">
                        Leave them
                      </button>
                    </p>
                  )}
                </td>
                <td className="py-2 text-slate-600">{rule.lastUsedAt.toLocaleDateString()}</td>
                {isOwner && (
                  <td className="py-2">
                    <button type="button" disabled={pending} onClick={() => forget(rule.id, rule.supplierName)}
                      className="rounded px-1.5 py-1 text-xs font-medium text-slate-600 underline-offset-2 transition-colors hover:text-red-800 hover:underline">
                      Forget
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
          {visible.length === 0 && (
            <tr><td colSpan={isOwner ? 4 : 3} className="py-3 text-slate-600">No suppliers match &ldquo;{filter}&rdquo;.</td></tr>
          )}
        </tbody>
      </table>
      {review && (
        <AccountCorrectionDialog
          open
          onClose={() => setReview(null)}
          workspaceId={workspaceId}
          connectionId={connectionId}
          provider={review.data.provider}
          providerLabel={review.data.providerLabel}
          oldAccountExternalId={review.reminder.oldAccountExternalId}
          oldAccountName={review.data.oldAccountName}
          newAccountExternalId={review.rule.accountExternalId}
          newAccountName={review.data.newAccountName}
          bills={review.data.bills}
          onResolved={() => { setReview(null); router.refresh() }}
        />
      )}
    </div>
  )
}

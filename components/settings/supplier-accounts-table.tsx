"use client"

import { forgetSupplierAccountRuleAction } from "@/app/(app)/workspaces/[workspaceId]/integration-connection-actions"
import {
  checkAffectedByRuleChangeAction,
  leaveAllAffectedByRuleAction,
  type AffectedByRuleChange,
} from "@/app/(app)/workspaces/[workspaceId]/account-correction-actions"
import { AccountCorrectionDialog } from "@/components/integrations/account-correction-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { formatUnresolvedAccountId } from "@/lib/finance/line-account-resolution"
import type { SupplierAccountRuleRow } from "@/models/supplier-account-rules"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

const FILTER_THRESHOLD = 20

/** #430 Screen 3 — keyed by `SupplierAccountRule.supplierName` (the rules table's own unique key),
 * one entry per supplier still carrying posted/paid bills on an account other than the rule's
 * current one. Server-resolved account name travels with the count so the row never needs its own
 * fetch just to render "still on {old account name}". */
export type SupplierAccountReminder = { oldAccountExternalId: string; oldAccountName: string; count: number }

/** #458 §6 — one synced reference a rule can hold, keyed `tax:‹id›`, `track:‹categoryId›:‹optionId›`
 * or `loc:‹id›`; inactive rows included so an archived code still reads by name. */
export type CodingLabel = { label: string; active: boolean; categoryName?: string }

// House copy has no serial comma ("Tax code, Class and Location"); Intl.ListFormat "en" adds one.
const joinAnd = (items: string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`

/** The rule's held Tax code, Tracking and Location, in that order, as `{name, value, stale}` parts. */
function heldParts(rule: SupplierAccountRuleRow, codingLabels: Record<string, CodingLabel>, trackingCategories: { id: string; name: string }[]) {
  const part = (name: string, key: string, id: string) => {
    const ref = codingLabels[key]
    return { name, value: ref?.label ?? formatUnresolvedAccountId(id), stale: !ref?.active }
  }
  return [
    ...(rule.taxCodeExternalId ? [part("Tax code", `tax:${rule.taxCodeExternalId}`, rule.taxCodeExternalId)] : []),
    ...rule.tracking.map((t) => {
      const key = `track:${t.categoryId}:${t.optionId}`
      const category = codingLabels[key]?.categoryName ?? trackingCategories.find((c) => c.id === t.categoryId)?.name ?? "Tracking"
      return part(category, key, t.optionId)
    }),
    ...(rule.locationExternalId ? [part("Location", `loc:${rule.locationExternalId}`, rule.locationExternalId)] : []),
  ]
}

/** Accounting page's learned-supplier table (#429 / ADR 0011): one row per supplier whose account
 * was learned from an approved document's largest line. Layout follows
 * CategoryAccountMappingTable's precedent (native table, no new component for the filter box). */
export function SupplierAccountsTable({ workspaceId, connectionId, rules, accountLabels, defaultAccountName, providerLabel, isOwner, reminders, codingLabels, trackingCategories, hasLocation }: {
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
  codingLabels: Record<string, CodingLabel>
  /** The ledger's own Tracking categories (its capabilities), for the copy and a nameless option. */
  trackingCategories: { id: string; name: string }[]
  hasLocation: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState("")
  const [helpOpen, setHelpOpen] = useState(false)
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

  const [confirm, setConfirm] = useState<SupplierAccountRuleRow | null>(null)
  const [forgetError, setForgetError] = useState<string | null>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  // Set on a successful Forget: once the refreshed rules drop that row, focus moves to the Forget at
  // the same visible index (the next row), else the last row's, else the intro or the empty text.
  const pendingFocusRef = useRef<{ ruleId: string; index: number } | null>(null)

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current
    if (!pendingFocus || rules.some((r) => r.id === pendingFocus.ruleId)) return
    pendingFocusRef.current = null
    const target = visible[pendingFocus.index] ?? visible[visible.length - 1]
    const id = target ? `forget-rule-${target.id}` : rules.length ? "supplier-accounts-intro" : "supplier-accounts-empty"
    document.getElementById(id)?.focus()
  }, [rules, visible])

  const forget = (rule: SupplierAccountRuleRow) => startTransition(async () => {
    setForgetError(null)
    let res: Awaited<ReturnType<typeof forgetSupplierAccountRuleAction>>
    try {
      res = await forgetSupplierAccountRuleAction(workspaceId, connectionId, rule.id)
    } catch {
      setForgetError("Couldn't reach DocuBite. Check your connection and try again.")
      return
    }
    if (!res.success) { setForgetError(`Couldn't forget it. ${res.error || "Could not forget this supplier's usual account"}`); return }
    toast.success(`Forgot ${rule.supplierName}'s usual account`)
    pendingFocusRef.current = { ruleId: rule.id, index: visible.findIndex((r) => r.id === rule.id) }
    setConfirm(null)
    router.refresh()
  })

  const categoryNames = trackingCategories.map((c) => c.name)
  const tracking = categoryNames.length ? joinAnd(categoryNames) : null

  if (rules.length === 0) {
    return (
      <p id="supplier-accounts-empty" tabIndex={-1} className="text-sm text-slate-600 outline-none">
        Supplier accounts fill in as documents get approved — the account of the largest line becomes that
        supplier&rsquo;s usual, with its Tax code{tracking && ` and ${tracking}`}.
      </p>
    )
  }

  const confirmParts = confirm ? heldParts(confirm, codingLabels, trackingCategories).map((p) => p.name) : []
  const confirmAccount = confirm ? (accountLabels[confirm.accountExternalId]?.label ?? formatUnresolvedAccountId(confirm.accountExternalId)) : ""

  return (
    <div className="space-y-3">
      <p id="supplier-accounts-intro" tabIndex={-1} className="max-w-prose text-sm text-slate-600 outline-none">
        The account of the largest line on a supplier&rsquo;s most recently approved document, with that
        line&rsquo;s Tax code{tracking && `, ${tracking}`}{hasLocation && " and the bill\u2019s Location"}. The Tax code is
        pre-filled only on lines kept on that account. Forget a supplier to learn it again from their next approval.
      </p>
      {/* Contextual help, unmounted while closed — the approval-workflow-form (#253) disclosure precedent. */}
      <div>
        <button type="button" aria-expanded={helpOpen} aria-controls="supplier-accounts-help" onClick={() => setHelpOpen((open) => !open)}
          className="text-left text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
          How pre-filling works
        </button>
        {helpOpen && (
          <ul id="supplier-accounts-help" className="mt-2 max-w-prose list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>When a supplier&rsquo;s next document is reviewed, its lines start on the usual account.</li>
            <li>
              Lines kept on that account also get the supplier&rsquo;s Tax code{tracking && ` and ${tracking}`}. A line moved
              to another account gets that account&rsquo;s default Tax code from {providerLabel} instead.
            </li>
            {hasLocation && <li>The bill gets the supplier&rsquo;s Location.</li>}
            <li>A code that is no longer in {providerLabel} is never pre-filled; the line waits for you to pick one.</li>
            <li>Anything pre-filled can be changed before approval. Each approval updates the supplier&rsquo;s usual set.</li>
          </ul>
        )}
      </div>
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
            const parts = heldParts(rule, codingLabels, trackingCategories)
            return (
              <tr key={rule.id} className="border-b border-hairline-soft last:border-0 align-top">
                <td className="py-2">{rule.supplierName}</td>
                <td className="py-2">
                  {account?.archived
                    ? <>{defaultAccountName ?? account.label} <span className="text-slate-600">({rule.supplierName}&rsquo;s account was archived in {providerLabel})</span></>
                    : (account?.label ?? formatUnresolvedAccountId(rule.accountExternalId))}
                  {parts.length > 0 && (
                    <p className="mt-0.5 text-xs text-slate-600">
                      {parts.map((part, i) => (
                        <span key={i}>
                          {i > 0 && " · "}
                          <span className="sm:whitespace-nowrap">{part.name}: {part.value}</span>
                          {part.stale && ` (no longer in ${providerLabel} — not pre-filled)`}
                        </span>
                      ))}
                    </p>
                  )}
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
                    <button type="button" id={`forget-rule-${rule.id}`} aria-label={`Forget ${rule.supplierName}'s usual account`} disabled={pending}
                      onClick={(e) => { openerRef.current = e.currentTarget; setForgetError(null); setConfirm(rule) }}
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
      {confirm && (
        <ConfirmDialog
          open
          destructive
          busy={pending}
          title={`Forget ${confirm.supplierName}'s usual account?`}
          description={`DocuBite stops pre-filling ${confirmAccount}${confirmParts.length ? ` and its ${joinAnd(confirmParts)}` : ""} for ${confirm.supplierName}. Bills already posted don't change. Their next approved document learns it again.`}
          confirmLabel="Forget"
          onConfirm={() => forget(confirm)}
          onCancel={() => { setConfirm(null); setForgetError(null) }}
          restoreFocusTo={openerRef}
        >
          {forgetError ? <p role="alert" className="text-sm text-red-700">{forgetError}</p> : undefined}
        </ConfirmDialog>
      )}
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

"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { adminPaths } from "@/lib/admin/paths"
import { currencyLockEvent, type CompanyDetailRow } from "@/lib/admin/companies"
import { CompanyDangerActions } from "@/components/admin/company-danger-actions"
import { ChangeCurrencyDialog } from "@/components/admin/change-currency-dialog"
import { DETAIL_PANE_ID } from "@/components/queue/detail-pane"

/** #285 spec §5.1, §5.3: the pane's body — summary `dl` plus the card-less danger zone. The
 * sticky bar (§5.2, Open + pane ⋯) is `paneActions`/`paneMenu` on `QueueScreen` in
 * `companies-queue.tsx` — it only needs the list row, not this loaded detail. */
export type CompanyDetailProps = {
  workspaceId: string
  row: CompanyDetailRow
  organizationName: string
  /** #457: after a Company currency change the queue refreshes; the reloaded pane remounts this. */
  onChanged?: () => void
}

// #457 §5.3, §9.9: a currency change refreshes the rows, which remounts this pane with the fresh
// row; the remount then puts focus back on Change, or on the pane heading if Change is gone.
let focusCurrencyOnMount = false

const ROLE_LABEL: Record<CompanyDetailRow["viewerRole"], string> = { owner: "Owner", reviewer: "Reviewer", member: "Member" }

function ownersLine(owners: string[]): string {
  if (owners.length === 0) return "—"
  if (owners.length <= 2) return owners.join(", ")
  return `${owners.slice(0, 2).join(", ")} and ${owners.length - 2} more`
}

export function CompanyDetail({ workspaceId, row, onChanged }: CompanyDetailProps) {
  const [changing, setChanging] = useState(false)
  const changeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!focusCurrencyOnMount) return
    focusCurrencyOnMount = false
    ;(changeRef.current ?? document.querySelector<HTMLElement>(`#${DETAIL_PANE_ID} h2`))?.focus()
  }, [])
  const target = row.allowedCurrencies.find((code) => code !== row.baseCurrency)
  const canChange = row.viewerRole === "owner" && !row.lock.locked && !!target && row.allowedCurrencies.includes(row.baseCurrency)
  const created = new Date(row.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
  return <div className="flex flex-col">
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 px-5 py-4 text-sm">
      <dt className="text-slate-600">Name</dt>
      <dd className="flex items-center gap-2 text-slate-900">{row.name}{row.isCurrent && <Badge variant="secondary">This company</Badge>}</dd>
      <dt className="text-slate-600">Country</dt>
      <dd className="text-slate-900">{row.country}</dd>
      <dt className="text-slate-600">Company currency</dt>
      <dd className="text-slate-900">
        {row.baseCurrency}
        {row.lock.locked && <span className="text-slate-600"> · locked since {currencyLockEvent(row.lock)}</span>}
        {canChange && <> <button ref={changeRef} type="button" onClick={() => setChanging(true)}
          className="ml-1 inline-flex min-h-11 items-center rounded-sm font-medium text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 md:min-h-6">Change</button></>}
      </dd>
      <dt className="text-slate-600">Tax jurisdiction</dt>
      <dd className="text-slate-900">{row.jurisdictionCode ?? <span>— <Link href={adminPaths(row.id).tax} className="text-emerald-700 hover:underline">Set it under Configuration › Tax</Link></span>}</dd>
      <dt className="text-slate-600">Members</dt>
      <dd className="text-slate-900">{row.memberCount} · owners: {ownersLine(row.owners)}</dd>
      <dt className="text-slate-600">Your role</dt>
      <dd className="text-slate-900">{ROLE_LABEL[row.viewerRole]}</dd>
      <dt className="text-slate-600">Created</dt>
      <dd className="text-slate-900">{created}</dd>
    </dl>
    {row.isCurrent
      ? <CompanyDangerActions workspaceId={workspaceId} name={row.name} isOwner={row.viewerRole === "owner"} />
      : <div className="border-t border-slate-200 px-5 py-4">
          <p className="max-w-[60ch] text-sm text-slate-600">To leave or delete {row.name}, open it and use its danger zone under Admin › Companies. <Link href={`/workspaces/${row.id}`} className="font-medium text-emerald-700 hover:underline">Open</Link></p>
        </div>}
    {canChange && <ChangeCurrencyDialog open={changing} workspaceId={workspaceId} companyId={row.id} from={row.baseCurrency} to={target!}
      unpostedCount={row.unpostedCount} restoreFocusTo={changeRef} onClose={() => setChanging(false)}
      onChanged={() => { focusCurrencyOnMount = true; onChanged?.() }} />}
  </div>
}

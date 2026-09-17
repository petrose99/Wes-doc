"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog } from "@/components/ui/dialog"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import type { Facet } from "@/components/queue/facet-filters"
import { ReadOnlyBand } from "@/components/admin/admin-ui"
import { CompanyDetail } from "@/components/admin/company-detail"
import { buildCountryList, buildCurrencyList, countryName } from "@/lib/geo/iso-lists"
import { adminPaths } from "@/lib/admin/paths"
import type { CompanyRow, CompanyViewerRole } from "@/lib/admin/companies"
import { companyActionErrorText } from "@/lib/admin/companies"
import {
  addCompanyAction,
  createOrganizationAction,
  loadCompanyDetailAction,
  moveCompanyIntoOrganizationAction,
} from "@/app/(app)/workspaces/[workspaceId]/admin/companies/actions"
import { createWorkspaceAction } from "@/app/(app)/workspaces/[workspaceId]/workspace-actions"

/** #285: the three page states the server page decides (spec §3.3). */
export type CompaniesPageState =
  | { kind: "personal" }
  | { kind: "ungrouped"; workspaceName: string }
  | {
      kind: "organization"
      organizationName: string
      rows: CompanyRow[]
      /** Companies in the organization the viewer is not a member of (spec §3.1's muted line). */
      hiddenCount: number
      /** Team workspaces the viewer owns that are in no organization — the Move dialog's list. */
      movable: { id: string; name: string; memberCount: number }[]
    }

export type CompaniesQueueProps = {
  workspaceId: string
  state: CompaniesPageState
  /** The viewer's role on the *current* workspace — gates the header controls (spec §3.4). */
  viewerRole: CompanyViewerRole
  /** Owners of the current workspace other than the viewer, for the read-only band. */
  owners: string[]
}

const ROLE_LABEL: Record<CompanyViewerRole, string> = { owner: "Owner", reviewer: "Reviewer", member: "Member" }

const SORTS: SortOption<CompanyRow>[] = [
  { key: "name", label: "Name A–Z", compare: (a, b) => a.name.localeCompare(b.name) },
  { key: "members", label: "Most members", compare: (a, b) => b.memberCount - a.memberCount },
]

const ROLE_FACET: Facet = { param: "role", label: "Your role", options: [{ value: "owner", label: "Owner" }, { value: "reviewer", label: "Reviewer" }, { value: "member", label: "Member" }] }

function filterByRole(rows: CompanyRow[], params: URLSearchParams): CompanyRow[] {
  const selected = params.get("role")
  if (!selected) return rows
  const wanted = new Set(selected.split(","))
  return rows.filter((row) => wanted.has(row.viewerRole))
}

export function CompaniesQueue({ workspaceId, state, viewerRole, owners }: CompaniesQueueProps) {
  if (state.kind === "personal") return <PersonalState workspaceId={workspaceId} />
  if (state.kind === "ungrouped") return <UngroupedState workspaceId={workspaceId} state={state} viewerRole={viewerRole} owners={owners} />
  return <OrganizationState workspaceId={workspaceId} state={state} viewerRole={viewerRole} owners={owners} />
}

/* ------------------------------------------------------------------------------- (c) --- */

function PersonalState({ workspaceId }: { workspaceId: string }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  return <section aria-labelledby="queue-title" className="mx-auto max-w-[60ch] px-6 py-10 text-center">
    <h1 id="queue-title" className="text-lg font-semibold text-slate-900">Your personal workspace isn&apos;t a company</h1>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">Companies are team workspaces inside an organization. Create one to start a separate set of books with you as its owner, then name its organization — or switch to a company you already belong to.</p>
    <div className="mt-5 flex flex-col items-center gap-3">
      <Button type="button" onClick={() => setCreating(true)}>Create a team workspace</Button>
      <Link href="/workspaces" className="text-sm font-medium text-emerald-700 hover:underline">Switch company</Link>
    </div>
    <CreateTeamWorkspaceDialog open={creating} onClose={() => setCreating(false)}
      onCreated={(newWorkspaceId, name) => { toast.success(`${name} created — name its organization next`); router.push(`${adminPaths(newWorkspaceId).companies}`) }} />
  </section>
}

function CreateTeamWorkspaceDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (workspaceId: string, name: string) => void }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { if (busy) return; onClose(); setName(""); setError(null) }
  return <Dialog open={open} onClose={close} title="Create a team workspace" initialFocus="#new-team-workspace-name">
    <form className="space-y-4 px-5 py-4" onSubmit={async (event) => {
      event.preventDefault()
      if (!name.trim()) return
      setBusy(true); setError(null)
      try {
        const result = await createWorkspaceAction(name.trim())
        if (result.success && result.data) { onClose(); onCreated(result.data.workspaceId, name.trim()); setName("") }
        else setError(result.error ?? "Couldn't create the workspace. Your entries are still here — try again.")
      } catch { setError("Couldn't reach the server. Your entries are still here — try again.") }
      finally { setBusy(false) }
    }}>
      <div className="space-y-1">
        <label htmlFor="new-team-workspace-name" className="text-sm font-medium text-slate-800">Name</label>
        <input id="new-team-workspace-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} autoComplete="off"
          className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
      </div>
      <p className="text-xs leading-relaxed text-slate-600">Starts empty, with you as its owner. Next you&apos;ll name its organization.</p>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create workspace"}</Button>
      </div>
    </form>
  </Dialog>
}

/* ------------------------------------------------------------------------------- (b) --- */

function UngroupedState({ workspaceId, state, viewerRole, owners }: { workspaceId: string; state: { workspaceName: string }; viewerRole: CompanyViewerRole; owners: string[] }) {
  const router = useRouter()
  const [naming, setNaming] = useState(false)
  const isOwner = viewerRole === "owner"
  const disclosure = `An organization groups companies under one login. Name yours to add companies, move other team workspaces you own into it, and see the people across them on Users. ${state.workspaceName} becomes its first company. The organization's name can't be changed here yet.`
  return <section aria-labelledby="queue-title" className="mx-auto max-w-[60ch] px-6 py-10 text-center">
    <h1 id="queue-title" className="text-lg font-semibold text-slate-900">Name your organization</h1>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">{disclosure}</p>
    {isOwner ? <div className="mt-5">
      <Button type="button" onClick={() => setNaming(true)}>Name your organization…</Button>
    </div> : <div className="mt-5 text-left"><ReadOnlyBand owners={owners}>Ask an owner: {owners.length ? <span className="font-medium">{owners.join(", ")}</span> : "an owner"} can name the organization.</ReadOnlyBand></div>}
    <NameOrganizationDialog open={naming} onClose={() => setNaming(false)} workspaceId={workspaceId} defaultName={state.workspaceName} disclosure={disclosure}
      onCreated={(orgName) => { toast.success(`${orgName} created`); router.refresh() }} />
  </section>
}

function NameOrganizationDialog({ open, onClose, workspaceId, defaultName, disclosure, onCreated }: {
  open: boolean; onClose: () => void; workspaceId: string; defaultName: string; disclosure: string; onCreated: (name: string) => void
}) {
  const [name, setName] = useState(defaultName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { if (busy) return; onClose(); setError(null) }
  return <Dialog open={open} onClose={close} title="Name your organization" description={disclosure} initialFocus="#org-name">
    <form className="space-y-4 px-5 py-4" onSubmit={async (event) => {
      event.preventDefault()
      if (!name.trim()) return
      setBusy(true); setError(null)
      try {
        const result = await createOrganizationAction(workspaceId, { name: name.trim() })
        if (result.success && result.data) { onClose(); onCreated(result.data.name) }
        else setError(companyActionErrorText(result.error ?? "failed", { org: name.trim() }))
      } catch { setError("Couldn't reach the server. Your entries are still here — try again.") }
      finally { setBusy(false) }
    }}>
      <div className="space-y-1">
        <label htmlFor="org-name" className="text-sm font-medium text-slate-800">Organization name</label>
        <input id="org-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} autoComplete="off"
          onFocus={(event) => event.currentTarget.select()}
          className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
      </div>
      {error && <p role="alert" aria-describedby="org-name" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create organization"}</Button>
      </div>
    </form>
  </Dialog>
}

/* ------------------------------------------------------------------------------- (a) --- */

function OrganizationState({ workspaceId, state, viewerRole, owners }: {
  workspaceId: string
  state: { organizationName: string; rows: CompanyRow[]; hiddenCount: number; movable: { id: string; name: string; memberCount: number }[] }
  viewerRole: CompanyViewerRole
  owners: string[]
}) {
  const router = useRouter()
  const isOwner = viewerRole === "owner"
  const { organizationName, rows, hiddenCount, movable } = state
  const [adding, setAdding] = useState(false)
  const [moving, setMoving] = useState(false)
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])

  const loadDetail = useCallback(async (id: string) => {
    const result = await loadCompanyDetailAction(workspaceId, id)
    if (!result.success || !result.data) return null
    return <CompanyDetail workspaceId={workspaceId} row={result.data} organizationName={organizationName} />
  }, [workspaceId, organizationName])

  // Plain path with no carried-over query — clears the Your role facet and sort as spec §4.1
  // requires, so a fresh row is never left hidden behind a stale filter.
  const afterMutation = (selectId?: string) => {
    router.push(`/workspaces/${workspaceId}/admin/companies${selectId ? `?company=${selectId}` : ""}`)
    router.refresh()
  }

  const columns: QueueColumn<CompanyRow>[] = [
    {
      key: "name", label: "Name", narrow: true, phone: "title",
      render: (row) => <span className="flex min-w-0 items-center gap-2"><span className="truncate">{row.name}</span>{row.isCurrent && <Badge variant="secondary" className="shrink-0">This company</Badge>}</span>,
    },
    { key: "country", label: "Country", phone: "subtitle", render: (row) => `${row.country} — ${countryName(row.country)}` },
    { key: "currency", label: "Currency", phone: "subtitle", priority: "low", render: (row) => row.baseCurrency },
    { key: "jurisdiction", label: "Tax jurisdiction", priority: "low", render: (row) => row.jurisdictionCode ?? "—" },
    { key: "members", label: "Members", phone: "trailing", className: "text-right tabular-nums", render: (row) => String(row.memberCount) },
    { key: "role", label: "Your role", phone: "pill", render: (row) => ROLE_LABEL[row.viewerRole] },
  ]

  return <>
    <QueueScreen<CompanyRow>
      title="Companies"
      basePath={`/workspaces/${workspaceId}/admin/companies`}
      rows={rows}
      rowId={(row) => row.id}
      rowName={(row) => ({ title: row.name, suffix: `${row.country} · ${row.baseCurrency} · ${row.memberCount} members · ${ROLE_LABEL[row.viewerRole]}` })}
      columns={columns}
      sortOptions={SORTS}
      facets={[ROLE_FACET]}
      filterRows={filterByRole}
      selectable={false}
      overrideMode={false}
      stat={<span className="text-sm text-slate-600">{rows.length} {rows.length === 1 ? "company" : "companies"}</span>}
      primaryAction={isOwner ? <Button type="button" size="sm" onClick={() => setAdding(true)}>Add a company</Button> : undefined}
      menu={isOwner && movable.length > 0 ? <button type="button" data-menu-close onClick={() => setMoving(true)}
        className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100">
        Move a company into {organizationName}…
      </button> : null}
      empty={{ filteredBody: "Clear a filter to widen the queue." }}
      loadDetail={loadDetail}
      cards={{ below: "md", label: (row) => [row.name, `${row.country} — ${countryName(row.country)}`, row.baseCurrency, `${row.memberCount} members`, ROLE_LABEL[row.viewerRole]].join(", ") }} />

    {!isOwner && <div className="px-6"><ReadOnlyBand owners={owners}>Ask an owner: {owners.length ? <span className="font-medium">{owners.join(", ")}</span> : "an owner"} can add or move companies.</ReadOnlyBand></div>}
    {hiddenCount > 0 && <p className="px-6 text-xs text-slate-500">{hiddenCount} more in {organizationName} you&apos;re not a member of.</p>}

    <AddCompanyDialog open={adding} onClose={() => setAdding(false)} workspaceId={workspaceId} organizationName={organizationName}
      currentRow={rowsById.get(workspaceId)}
      onAdded={(id, name) => { setAdding(false); toast.success(`${name} added`, { action: { label: "Open", onClick: () => router.push(`${adminPaths(id).companies}`) } }); afterMutation(id) }} />

    <MoveCompanyDialog open={moving} onClose={() => setMoving(false)} workspaceId={workspaceId} organizationName={organizationName} candidates={movable}
      onMoved={(id, name) => { setMoving(false); toast.success(`${name} moved into ${organizationName}`, { duration: 8000 }); afterMutation(id) }} />
  </>
}

function AddCompanyDialog({ open, onClose, workspaceId, organizationName, currentRow, onAdded }: {
  open: boolean; onClose: () => void; workspaceId: string; organizationName: string; currentRow?: CompanyRow
  onAdded: (id: string, name: string) => void
}) {
  const countries = useMemo(() => buildCountryList(), [])
  const currencies = useMemo(() => buildCurrencyList(), [])
  const [name, setName] = useState("")
  const [country, setCountry] = useState(currentRow?.country ?? "US")
  const [currency, setCurrency] = useState(currentRow?.baseCurrency ?? "USD")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { if (busy) return; onClose(); setName(""); setError(null) }
  return <Dialog open={open} onClose={close} title="Add a company" initialFocus="#add-company-name">
    <form className="space-y-4 px-5 py-4" onSubmit={async (event) => {
      event.preventDefault()
      if (!name.trim()) return
      setBusy(true); setError(null)
      try {
        const result = await addCompanyAction(workspaceId, { name: name.trim(), country, baseCurrency: currency })
        if (result.success && result.data) onAdded(result.data.workspaceId, result.data.name)
        else setError(companyActionErrorText(result.error ?? "failed", { name: name.trim(), org: organizationName }))
      } catch { setError("Couldn't add the company. Your entries are still here — try again.") }
      finally { setBusy(false) }
    }}>
      <div className="space-y-1">
        <label htmlFor="add-company-name" className="text-sm font-medium text-slate-800">Name</label>
        <input id="add-company-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} autoComplete="off"
          aria-describedby={error ? "add-company-error" : undefined}
          className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="add-company-country" className="text-sm font-medium text-slate-800">Country</label>
          <select id="add-company-country" value={country} onChange={(event) => setCountry(event.target.value)}
            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600">
            {countries.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="add-company-currency" className="text-sm font-medium text-slate-800">Currency</label>
          <select id="add-company-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}
            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600">
            {currencies.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-600">Starts empty inside {organizationName}, with you as its owner. Nothing is shared between companies — suppliers, settings and members are set up per company.</p>
      {error && <p id="add-company-error" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add company"}</Button>
      </div>
    </form>
  </Dialog>
}

function MoveCompanyDialog({ open, onClose, workspaceId, organizationName, candidates, onMoved }: {
  open: boolean; onClose: () => void; workspaceId: string; organizationName: string
  candidates: { id: string; name: string; memberCount: number }[]
  onMoved: (id: string, name: string) => void
}) {
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { if (busy) return; onClose(); setChosenId(null); setError(null) }
  const chosen = candidates.find((c) => c.id === chosenId)
  return <Dialog open={open} onClose={close} title={`Move a company into ${organizationName}`} description="Team workspaces you own that aren't in an organization yet." initialFocus="input[type=radio]">
    <form className="space-y-4 px-5 py-4" onSubmit={async (event) => {
      event.preventDefault()
      if (!chosenId) return
      setBusy(true); setError(null)
      try {
        const result = await moveCompanyIntoOrganizationAction(workspaceId, chosenId)
        if (result.success && result.data) onMoved(result.data.workspaceId, result.data.name)
        else setError(companyActionErrorText(result.error ?? "failed", { name: chosen?.name, org: organizationName }))
      } catch { setError("Couldn't reach the server. Your entries are still here — try again.") }
      finally { setBusy(false) }
    }}>
      {candidates.length === 0 ? <p className="text-sm text-slate-600">Nothing left to move.</p> : <fieldset className="max-h-[60vh] space-y-1 overflow-y-auto">
        <legend className="mb-1 text-sm font-medium text-slate-800">Team workspaces</legend>
        {candidates.map((candidate) => <label key={candidate.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
          <input type="radio" name="move-target" value={candidate.id} checked={chosenId === candidate.id} onChange={() => setChosenId(candidate.id)} className="h-4 w-4 accent-emerald-700" />
          <span className="text-slate-900">{candidate.name}</span>
          <span className="text-xs text-slate-600">{candidate.memberCount} members</span>
        </label>)}
      </fieldset>}
      <p className="text-xs leading-relaxed text-slate-600">Its members keep their roles. Owners of {organizationName} who are also its members will see it under Companies and Users — belonging to {organizationName} opens nothing by itself. Nothing is shared between companies. You can remove it from {organizationName} later.</p>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || !chosenId || candidates.length === 0}>{busy ? "Moving…" : "Move into"} {organizationName}</Button>
      </div>
    </form>
  </Dialog>
}

"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog } from "@/components/ui/dialog"
import { NativeSelect } from "@/components/ui/native-select"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import type { Facet } from "@/components/queue/facet-filters"
import { ReadOnlyBand, Consequence } from "@/components/admin/admin-ui"
import { UserDetail, type UserPaneApi } from "@/components/admin/user-detail"
import { PaneMenuItem } from "@/components/queue/detail-pane"
import type { PaneHelpers } from "@/components/queue/queue-screen"
import { adminPaths } from "@/lib/admin/paths"
import {
  type UserRow, type UsersPageData, ROLE_LABELS, ROLE_CONSEQUENCE,
  displayName, statusLabel, filterUserRows, daysUntil, actionErrorText,
} from "@/lib/admin/users"
import { inviteUserAction, loadUserDetailAction } from "@/app/(app)/workspaces/[workspaceId]/admin/users/actions"

export type UsersQueueProps = {
  workspaceId: string
  data: UsersPageData
  initialSelectedId?: string | null
  initialMissing?: { text: string }
}

const SORTS: SortOption<UserRow>[] = [
  { key: "name", label: "Name A–Z", compare: (a, b) => displayName(a).localeCompare(displayName(b)) },
  { key: "companies", label: "Most companies", compare: (a, b) => b.companies.length - a.companies.length },
  { key: "newest", label: "Newest", compare: (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime() },
]

const ROLE_FACET: Facet = {
  param: "role", label: "Role here",
  options: [{ value: "owner", label: "Owner" }, { value: "reviewer", label: "Reviewer" }, { value: "member", label: "Member" }, { value: "none", label: "Not a member" }],
}
const STATUS_FACET: Facet = {
  param: "status", label: "Status",
  options: [{ value: "active", label: "Active" }, { value: "invited", label: "Invited" }, { value: "expired", label: "Invitation expired" }],
}

/** Admin › Users, org-level Queue-screen shell (#286 spec §2–§4.1). The three page states share
 * one component: (a) organization, (b) team workspace with no organization, (c) personal. */
export function UsersQueue({ workspaceId, data, initialSelectedId = null, initialMissing }: UsersQueueProps) {
  const router = useRouter()
  const { mode, rows, ownedCompanies, unownedCompanies, ownersByCompany, organizationName, hiddenCompanyCount, currentCompany } = data
  const [inviting, setInviting] = useState(false)
  const isOwner = ownedCompanies.length > 0
  const currentOwners = ownersByCompany[currentCompany.workspaceId] ?? []

  const companyFacet = useMemo<Facet | null>(() => {
    if (mode !== "org") return null
    const seen = new Map<string, string>()
    for (const row of rows) for (const company of row.companies) seen.set(company.workspaceId, company.workspaceName)
    return { param: "company", label: "Company", options: [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })) }
  }, [mode, rows])

  const columns: QueueColumn<UserRow>[] = [
    {
      key: "name", label: "Name", narrow: true, phone: "title",
      render: (row) => <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-slate-900">{displayName(row)}</span>
          {row.isViewer && <Badge variant="secondary" className="shrink-0">You</Badge>}
          {row.kind === "invited" && <Badge variant="secondary" className="shrink-0">{row.expired ? "Invitation expired" : "Invited"}</Badge>}
        </span>
        {row.kind === "member" && <span className="truncate text-xs text-slate-500">{row.email}</span>}
      </span>,
    },
    ...(mode === "org" ? [{
      key: "companies", label: "Companies", phone: "trailing",
      render: (row: UserRow) => {
        const names = row.companies.map((company) => company.workspaceName)
        if (names.length <= 2) return names.join(", ") || "—"
        return `${names.slice(0, 2).join(", ")}, +${names.length - 2} more`
      },
      phoneRender: (row: UserRow) => row.companies.length === 1 ? row.companies[0].workspaceName : `${row.companies.length} companies`,
    } as QueueColumn<UserRow>] : []),
    { key: "role", label: `Role in ${currentCompany.name}`, phone: "pill", render: (row) => row.roleHere ? ROLE_LABELS[row.roleHere] : "—" },
    {
      key: "status", label: "Status", priority: "low",
      render: (row) => <span className="flex flex-col">
        <span>{statusLabel(row)}</span>
        {row.kind === "invited" && <span className="text-xs text-slate-500">Expires in {daysUntil(row.expiresAt)} days</span>}
      </span>,
    },
    ...(mode === "org" ? [{ key: "org", label: "Organization", priority: "low", render: (row: UserRow) => row.orgRole === "admin" ? "Org admin" : "—" } as QueueColumn<UserRow>] : []),
  ]

  const facets = [ROLE_FACET, STATUS_FACET, ...(companyFacet ? [companyFacet] : [])]

  // The pane content is rendered by `loadDetail` without the shell's helpers; `paneMenu` receives
  // them on every render, so a ref carries close/refresh to the content and the content's actions
  // (Resend · Revoke · Leave, spec §5.1) back to the ⋯ menu.
  const helpersRef = useRef<PaneHelpers | null>(null)
  const paneHelpers = useMemo(() => ({ close: () => helpersRef.current?.close(), refresh: () => helpersRef.current?.refresh() }), [])
  const [paneApi, setPaneApi] = useState<UserPaneApi | null>(null)
  const register = useCallback((api: UserPaneApi | null) => setPaneApi(api), [])
  const loadDetail = useCallback(async (key: string) => {
    const result = await loadUserDetailAction(workspaceId, key)
    if (!result.success || !result.data) return null
    return <UserDetail workspaceId={workspaceId} row={result.data} currentWorkspaceId={currentCompany.workspaceId} currentCompanyName={currentCompany.name}
      currentCompanyKind={currentCompany.kind} ownersByCompany={ownersByCompany} ownedCompanies={ownedCompanies} helpers={paneHelpers} register={register} />
  }, [workspaceId, currentCompany, ownersByCompany, ownedCompanies, paneHelpers, register])
  const paneMenu = (row: UserRow, helpers: PaneHelpers) => {
    helpersRef.current = helpers
    return <>
      <PaneMenuItem onClick={() => { void navigator.clipboard.writeText(row.email); toast.success("Email copied") }}>Copy email</PaneMenuItem>
      {paneApi?.resend && <PaneMenuItem onClick={paneApi.resend}>Resend</PaneMenuItem>}
      {paneApi?.revoke && <PaneMenuItem tone="red" onClick={paneApi.revoke}>Revoke invitation</PaneMenuItem>}
      {paneApi?.leave && <PaneMenuItem tone="red" onClick={paneApi.leave}>Leave {currentCompany.name}</PaneMenuItem>}
    </>
  }

  // Spec §3.3 (c): the personal workspace is still a one-row list (You · Owner) whose pane opens
  // for your bank details; the header sentence replaces Invite, and there is nothing to filter.
  const bandLine = mode === "personal"
    ? <p className="max-w-[70ch] px-4 py-1.5 text-xs text-slate-500">Your personal workspace is just you. Create a team workspace on <Link href={adminPaths(workspaceId).companies} className="font-medium text-emerald-700 hover:underline">Companies</Link> to invite people.</p>
    : mode === "org"
    ? <p className="max-w-[70ch] px-4 py-1.5 text-xs text-slate-500">
        Across {new Set(rows.flatMap((row) => row.companies.map((company) => company.workspaceId))).size} companies in {organizationName}.
        {hiddenCompanyCount > 0 && ` ${hiddenCompanyCount} more ${hiddenCompanyCount === 1 ? "company" : "companies"} in ${organizationName} aren't shown — you're not a member of ${hiddenCompanyCount === 1 ? "it" : "them"}.`}
      </p>
    : mode === "team"
      ? <p className="max-w-[70ch] px-4 py-1.5 text-xs text-slate-500">
          People with access to {currentCompany.name}.{" "}
          {isOwner && <>Name your organization on <Link href={adminPaths(workspaceId).companies} className="font-medium text-emerald-700 hover:underline">Companies</Link> to see people across companies.</>}
        </p>
      : null

  return <>
    <QueueScreen<UserRow>
      title="Users"
      basePath={adminPaths(workspaceId).users}
      rows={rows}
      rowId={(row) => row.key}
      rowName={(row) => ({ title: displayName(row), suffix: `${row.companies.length} ${row.companies.length === 1 ? "company" : "companies"} · ${row.roleHere ? ROLE_LABELS[row.roleHere] : "not in this company"} · ${statusLabel(row)}` })}
      columns={columns}
      sortOptions={mode === "personal" ? [] : SORTS}
      facets={mode === "personal" ? [] : facets}
      filterRows={filterUserRows}
      search={mode === "personal" ? undefined : { param: "q", label: "Find by name or email" }}
      selectable={false}
      overrideMode={false}
      primaryAction={isOwner ? <Button type="button" size="sm" className="hidden md:inline-flex" onClick={() => setInviting(true)}>Invite a user</Button> : undefined}
      band={bandLine}
      empty={{ filteredTitle: "Nothing matches these filters.", filteredAction: <Button type="button" size="sm" variant="outline" onClick={() => router.push(adminPaths(workspaceId).users)}>Clear filters</Button> }}
      onExportAll={async () => {
        const csv = ["Name,Email,Companies,Role here,Status", ...rows.map((row) => [displayName(row), row.email, row.companies.map((c) => c.workspaceName).join("; "), row.roleHere ? ROLE_LABELS[row.roleHere] : "", statusLabel(row)].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n")
        const blob = new Blob([csv], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url; anchor.download = "users.csv"; anchor.click()
        URL.revokeObjectURL(url)
      }}
      loadDetail={loadDetail}
      paneMenu={paneMenu}
      initialSelectedId={initialSelectedId}
      initialMissing={initialMissing}
      cards={{ below: "md", label: (row) => [displayName(row), row.email, `${row.companies.length} ${row.companies.length === 1 ? "company" : "companies"}`, row.roleHere ? ROLE_LABELS[row.roleHere] : "not in this company", statusLabel(row)].join(", ") }} />

    {!isOwner && mode !== "personal" && <div className="px-6"><ReadOnlyBand owners={currentOwners}>Ask an owner: {currentOwners.length ? <span className="font-medium">{currentOwners.join(", ")}</span> : "an owner"} can invite people and change roles.</ReadOnlyBand></div>}

    <InviteDialog open={inviting} onClose={() => setInviting(false)} workspaceId={workspaceId} currentWorkspaceId={currentCompany.workspaceId}
      ownedCompanies={ownedCompanies} unownedCompanies={unownedCompanies}
      onSent={(inviteUrl, invitationId, email, companies) => {
        setInviting(false)
        router.push(`${adminPaths(workspaceId).users}/inv:${invitationId}`)
        router.refresh()
        toast.success(`Invitation sent to ${email} — ${companies} ${companies === 1 ? "company" : "companies"}`, { action: { label: "Copy link", onClick: () => { void navigator.clipboard.writeText(inviteUrl) } } })
      }} />
  </>
}

function InviteDialog({ open, onClose, workspaceId, currentWorkspaceId, ownedCompanies, unownedCompanies, onSent }: {
  open: boolean
  onClose: () => void
  workspaceId: string
  currentWorkspaceId: string
  ownedCompanies: { workspaceId: string; name: string }[]
  unownedCompanies: { workspaceId: string; name: string }[]
  onSent: (inviteUrl: string, invitationId: string, email: string, companies: number) => void
}) {
  const [email, setEmail] = useState("")
  const [ticked, setTicked] = useState<Record<string, boolean>>(() => ({ [currentWorkspaceId]: true, ...(ownedCompanies.length === 1 ? { [ownedCompanies[0].workspaceId]: true } : {}) }))
  const [roles, setRoles] = useState<Record<string, "owner" | "reviewer" | "member">>(() => ({ [currentWorkspaceId]: "member" }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const grants = ownedCompanies.filter((company) => ticked[company.workspaceId])
  // One owned company (every (b) team workspace, some (a) viewers): pre-ticked and locked, with the
  // lock's visible reason — an invitation with nothing ticked would be nothing (spec §3.3 b).
  const locked = ownedCompanies.length === 1
  const emailRef = useRef<HTMLInputElement>(null)
  const failWith = (message: string) => { setError(message); window.requestAnimationFrame(() => emailRef.current?.focus()) }
  const close = () => { if (busy) return; onClose(); setEmail(""); setTicked({ [currentWorkspaceId]: true }); setRoles({ [currentWorkspaceId]: "member" }); setError(null) }
  return <Dialog open={open} onClose={close} title="Invite a user" description="One invitation can open several companies. They get an email with a link that works for seven days." initialFocus="#invite-email">
    <form className="space-y-4 px-5 py-4" onSubmit={async (event) => {
      event.preventDefault()
      if (!email.trim() || grants.length === 0) return
      setBusy(true); setError(null)
      try {
        const result = await inviteUserAction(workspaceId, { email: email.trim(), grants: grants.map((company) => ({ workspaceId: company.workspaceId, role: roles[company.workspaceId] ?? "member" })) })
        if (result.success && result.data) onSent(result.data.inviteUrl, result.data.invitationId, email.trim(), result.data.companies)
        else failWith(actionErrorText(result.error ?? "invite_failed", { email: email.trim() }))
      } catch { failWith("Couldn't send the invitation. Your entries are still here — try again.") }
      finally { setBusy(false) }
    }}>
      <div className="space-y-1">
        <label htmlFor="invite-email" className="text-sm font-medium text-slate-800">Email</label>
        <input ref={emailRef} id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="off" disabled={busy}
          className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
      </div>
      <fieldset className="max-h-[50vh] overflow-y-auto">
        <legend className="mb-1 text-sm font-medium text-slate-800">Companies and roles</legend>
        <div className="divide-y divide-slate-100 border-y border-slate-100">
        {ownedCompanies.map((company) => {
          const isTicked = !!ticked[company.workspaceId]
          const role = roles[company.workspaceId] ?? "member"
          return <div key={company.workspaceId} className="py-2.5">
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={isTicked || locked} disabled={busy || locked} aria-describedby={locked ? "invite-locked-reason" : undefined} onChange={(event) => setTicked((prev) => ({ ...prev, [company.workspaceId]: event.target.checked }))} className="h-4 w-4 accent-emerald-700" />
              <span className="flex-1 text-slate-900">{company.name}</span>
              <NativeSelect value={role} disabled={!isTicked || busy} aria-label={`Role at ${company.name}`} className="h-8 w-[8.5rem]"
                onChange={(event) => setRoles((prev) => ({ ...prev, [company.workspaceId]: event.target.value as "owner" | "reviewer" | "member" }))}>
                <option value="owner">Owner</option>
                <option value="reviewer">Reviewer</option>
                <option value="member">Member</option>
              </NativeSelect>
            </label>
            {locked && <p id="invite-locked-reason" className="mt-1 pl-6 text-xs text-slate-500">The only company you own here.</p>}
            {isTicked && <div className="mt-1.5 pl-6"><Consequence>{ROLE_CONSEQUENCE[role](company.name)}</Consequence></div>}
          </div>
        })}
        </div>
        {unownedCompanies.length > 0 && <p className="mt-2 text-xs text-slate-500">You can&apos;t invite to {unownedCompanies.map((c) => c.name).join(", ")} — ask their owners.</p>}
      </fieldset>
      {grants.length === 0 && <p className="text-xs text-slate-500">Tick at least one company</p>}
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || !email.trim() || grants.length === 0}>{busy ? "Sending…" : "Send invitation"}</Button>
      </div>
    </form>
  </Dialog>
}

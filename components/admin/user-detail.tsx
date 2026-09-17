"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { NativeSelect } from "@/components/ui/native-select"
import { Pill } from "@/components/automation/automation-ui"
import { Consequence } from "@/components/admin/admin-ui"
import { AdminSaveBar } from "@/components/admin/admin-save-bar"
import { useAsyncConfirm } from "@/components/admin/user-confirm"
import { usePhoneLane } from "@/lib/client/use-phone-lane"
import {
  ROLE_CONSEQUENCE, ROLE_LABELS, actionErrorText, displayName,
  type UserRole, type UserRow, type UserRowCompany,
} from "@/lib/admin/users"
import {
  addUserToCompanyAction, removeMemberAction, resendInvitationAction, revokeInvitationAction,
  saveMemberBankDetailsAction, setMemberRoleAction,
} from "@/app/(app)/workspaces/[workspaceId]/admin/users/actions"

/** #286 spec §5: the Users pane. Member rows get a tablist (Information · Companies, n) and one
 * save bar for role changes and bank details (explicit Save, #231 d23); invited rows get the
 * invitation's facts and Resend / Revoke / Copy link. Every ⚠ action confirms with its
 * consequence through the shared `useAsyncConfirm` dialog (B1); every mutation refreshes both the
 * list (`router.refresh`) and the pane (`helpers.refresh`) in the same tick (B2). Client-only:
 * imports `lib/admin/users`, never `models/*`. */
export type UserPaneHelpers = { close: () => void; refresh: () => void }

/** The pane ⋯ menu lives on the QueueScreen, outside this component; it reaches the pane's
 * actions through this registry (spec §5.1: Copy email · Resend · Revoke · Leave). */
export type UserPaneApi = { resend?: () => void; revoke?: () => void; leave?: () => void }

export type UserDetailProps = {
  workspaceId: string
  row: UserRow
  currentWorkspaceId: string
  currentCompanyName: string
  currentCompanyKind: "personal" | "team"
  ownersByCompany: Record<string, string[]>
  ownedCompanies: { workspaceId: string; name: string }[]
  helpers: UserPaneHelpers
  register?: (api: UserPaneApi | null) => void
}

const ROLES: UserRole[] = ["owner", "reviewer", "member"]
const UNDO_MS = 8000

function ownerNames(owners: string[] | undefined): string {
  return owners?.length ? owners.join(", ") : "an owner"
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
}

function orderCompanies(companies: UserRowCompany[], currentWorkspaceId: string): UserRowCompany[] {
  return [...companies].sort((a, b) => {
    if (a.workspaceId === currentWorkspaceId) return -1
    if (b.workspaceId === currentWorkspaceId) return 1
    return a.workspaceName.localeCompare(b.workspaceName)
  })
}

export function UserDetail(props: UserDetailProps) {
  const { row } = props
  return <div className="flex flex-col gap-4 px-4 pb-4 pt-3">
    <PaneHeader row={row} />
    {row.kind === "invited" ? <InvitedBody {...props} /> : <MemberBody {...props} />}
  </div>
}

function PaneHeader({ row }: { row: UserRow }) {
  const status = row.kind === "invited" ? (row.expired ? "Invitation expired" : "Invited") : null
  const here = row.roleHere ? `${ROLE_LABELS[row.roleHere]} here` : null
  return <div className="flex flex-col gap-2">
    <p className="text-sm text-slate-600">{row.email}</p>
    <div className="flex flex-wrap items-center gap-1.5">
      {row.isViewer && <Pill state="idle">You</Pill>}
      {status && <Pill state={row.expired ? "blocked" : "waiting"}>{status}</Pill>}
      {here && <Pill state="auto">{here}</Pill>}
    </div>
  </div>
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[9rem_1fr] gap-x-3 py-1.5 text-sm">
    <dt className="text-slate-500">{term}</dt>
    <dd className="min-w-0 break-words text-slate-900">{children}</dd>
  </div>
}

// ── Invited rows (spec §5.3) ────────────────────────────────────────────────────────────────────

function InvitedBody({ workspaceId, row, helpers, register, ownersByCompany }: UserDetailProps) {
  const router = useRouter()
  const confirm = useAsyncConfirm()
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copyFallback, setCopyFallback] = useState(false)
  const [copied, setCopied] = useState(false)
  const email = row.email
  const invitationId = row.invitationId ?? ""
  const canManage = !!row.viewerOwnsPrimary
  const primary = row.primaryWorkspaceName ?? row.companies[0]?.workspaceName ?? "this company"
  const primaryId = row.companies.find((c) => c.workspaceName === primary)?.workspaceId
  const grantsSentence = row.companies.map((c) => `${c.workspaceName} (${ROLE_LABELS[c.role]})`).join(" and ")

  const resend = useCallback(async () => {
    const ok = await confirm.ask({
      title: `Resend the invitation to ${email}?`,
      description: `A fresh seven-day link is sent for ${grantsSentence} — the previous one stops working.`,
      confirmLabel: "Resend", destructive: false, busyLabel: "Resending…",
    })
    if (!ok) return
    const result = await resendInvitationAction(workspaceId, { invitationId })
    if (!result.success || !result.data) {
      const code = result.error ?? "resend_failed"
      confirm.fail(code.startsWith("member_already_exists") ? `${email} already has access to ${code.split(":")[1] ?? "that company"} — untick it. Open their row to change that role.` : code === "resend_failed" ? "Nothing was changed — try again." : actionErrorText(code, { email }))
      return
    }
    confirm.close()
    setInviteUrl(result.data.inviteUrl)
    const url = result.data.inviteUrl
    toast.success(`Invitation resent to ${email}`, { action: { label: "Copy link", onClick: () => { void navigator.clipboard.writeText(url) } } })
    // The re-issued invitation is a new record: the row key changes with it.
    router.replace(`${window.location.pathname.replace(/\/inv:[^/]+$/, "")}/inv:${result.data.invitationId}`)
    router.refresh()
    helpers.refresh()
  }, [confirm, email, grantsSentence, helpers, invitationId, router, workspaceId])

  const revoke = useCallback(async () => {
    const ok = await confirm.ask({
      title: `Revoke the invitation to ${email}?`,
      description: "The link stops working at once. Nothing else changes — you can invite them again.",
      confirmLabel: "Revoke invitation", destructive: true, busyLabel: "Revoking…",
    })
    if (!ok) return
    const result = await revokeInvitationAction(workspaceId, { invitationId })
    if (!result.success) {
      const code = result.error ?? "revoke_failed"
      confirm.fail(code === "revoke_failed" ? "Nothing was changed — try again." : actionErrorText(code, { email }))
      return
    }
    confirm.close()
    toast.success(`Invitation to ${email} revoked`)
    helpers.close()
    router.refresh()
    window.requestAnimationFrame(() => document.getElementById("queue-title")?.focus())
  }, [confirm, email, helpers, invitationId, router, workspaceId])

  // Stable wrappers over the latest callbacks: `useAsyncConfirm` returns a new object per render,
  // so registering the callbacks themselves would re-register (and re-render the queue) every time.
  const latest = useRef({ resend, revoke })
  useEffect(() => { latest.current = { resend, revoke } }, [resend, revoke])
  useEffect(() => {
    if (!register) return
    register(canManage ? { resend: () => { void latest.current.resend() }, revoke: () => { void latest.current.revoke() } } : {})
    return () => register(null)
  }, [register, canManage])

  const copyLink = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 3000)
    } catch {
      setCopyFallback(true)
    }
  }

  return <>
    <dl className="divide-y divide-slate-100 border-y border-slate-100">
      <Fact term="Email">{row.email}</Fact>
      <Fact term="Companies and roles">
        <ul className="space-y-0.5">{row.companies.map((c) => <li key={c.workspaceId}>{c.workspaceName} · {ROLE_LABELS[c.role]}</li>)}</ul>
      </Fact>
      <Fact term="Sent by">{row.sentBy ?? "—"}</Fact>
      <Fact term="Sent">{formatDate(row.createdAt)}</Fact>
      <Fact term="Expires">
        {row.expired ? <>
          <span>Expired {formatDate(row.expiresAt)}</span>
          <span className="mt-0.5 block text-[13px] text-slate-600">Expired links don&apos;t work — resend to issue a new one.</span>
        </> : formatDate(row.expiresAt)}
      </Fact>
    </dl>

    {canManage ? <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" onClick={() => { void resend() }}>Resend</Button>
      <Button type="button" size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => { void revoke() }}>Revoke invitation</Button>
      {inviteUrl && <Button type="button" size="sm" variant="ghost" onClick={() => { void copyLink() }}>Copy link</Button>}
      <span role="status" className="text-xs text-emerald-800">{copied ? "Link copied" : ""}</span>
    </div> : <Consequence>Ask an owner of {primary}: <span className="font-medium">{ownerNames(ownersByCompany[primaryId ?? ""])}</span> can resend or revoke it.</Consequence>}
    {copyFallback && inviteUrl && <div className="flex flex-col gap-1">
      <label htmlFor="invite-link-fallback" className="text-xs text-slate-600">Copy this link</label>
      <input id="invite-link-fallback" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} autoFocus
        className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
    </div>}
    {confirm.dialog}
  </>
}

// ── Member rows (spec §5.2, §4.2–§4.5) ──────────────────────────────────────────────────────────

type Tab = "information" | "companies"
type BankDraft = { bankName: string; accountNumber: string; branchCode: string }

function MemberBody({ workspaceId, row, currentWorkspaceId, currentCompanyName, currentCompanyKind, ownersByCompany, ownedCompanies, helpers, register }: UserDetailProps) {
  const router = useRouter()
  const confirm = useAsyncConfirm()
  const phone = usePhoneLane()
  const name = displayName(row)
  const userId = row.userId ?? ""
  const companies = useMemo(() => orderCompanies(row.companies, currentWorkspaceId), [row.companies, currentWorkspaceId])
  const current = companies.find((c) => c.workspaceId === currentWorkspaceId) ?? null
  const viewerOwnsCurrent = !!current?.viewerOwns
  const canEditBank = !phone && (viewerOwnsCurrent || row.isViewer) && current !== null
  const canEditAnyRole = !phone && companies.some((c) => c.viewerOwns)
  const eligible = useMemo(() => ownedCompanies.filter((c) => !row.companies.some((rc) => rc.workspaceId === c.workspaceId)), [ownedCompanies, row.companies])

  const [tab, setTab] = useState<Tab>("information")
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({})
  const [bankDraft, setBankDraft] = useState<BankDraft | null>(null)
  const [bankErrors, setBankErrors] = useState<Partial<Record<keyof BankDraft, string>>>({})
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  const baseId = useId()

  const dirtyRoles = companies.filter((c) => pendingRoles[c.workspaceId] && pendingRoles[c.workspaceId] !== c.role)
  const bankDirty = bankDraft !== null
  const dirty = dirtyRoles.length > 0 || bankDirty

  const refreshBoth = useCallback(() => { router.refresh(); helpers.refresh() }, [router, helpers])

  // ── Roles: explicit Save (§4.3) ──
  const discard = () => { setPendingRoles({}); setBankDraft(null); setBankErrors({}); setSectionErrors({}); setSaveError(null); setStatus(null) }

  const validateBank = (draft: BankDraft): Partial<Record<keyof BankDraft, string>> => {
    const errors: Partial<Record<keyof BankDraft, string>> = {}
    const anySet = draft.bankName.trim() || draft.accountNumber.trim() || draft.branchCode.trim()
    if (!anySet) return errors
    if (!draft.bankName.trim()) errors.bankName = "Bank name is needed"
    const digits = draft.accountNumber.replace(/\s+/g, "")
    if (!digits) errors.accountNumber = "Account number is needed"
    else if (!/^\d{6,20}$/.test(digits)) errors.accountNumber = "Digits only, 6 to 20"
    const branch = draft.branchCode.trim()
    if (branch.length < 3 || branch.length > 10) errors.branchCode = "3 to 10 characters"
    return errors
  }

  const save = async () => {
    if (saving || !dirty) return
    setSaveError(null); setStatus(null); setSectionErrors({})
    if (bankDraft) {
      const errors = validateBank(bankDraft)
      setBankErrors(errors)
      if (Object.keys(errors).length) { setSaveError("Check the bank details."); return }
    }
    // Own row, Owner → lower: the one change the actor cannot reverse (§4.3).
    for (const section of dirtyRoles) {
      if (row.isViewer && section.role === "owner" && pendingRoles[section.workspaceId] !== "owner") {
        const others = ownerNames(ownersByCompany[section.workspaceId])
        const ok = await confirm.ask({
          title: `Give up ownership of ${section.workspaceName}?`,
          description: `You become a ${ROLE_LABELS[pendingRoles[section.workspaceId]]} of ${section.workspaceName}. You can't undo this yourself — only ${others} can make you an owner again.`,
          confirmLabel: "Give up ownership", destructive: true, busyLabel: "Saving…",
        })
        confirm.close()
        if (!ok) return
      }
    }
    setSaving(true)
    let savedCount = 0
    let gaveUpCurrent: UserRole | null = null
    const total = dirtyRoles.length + (bankDirty ? 1 : 0)
    const remaining: Record<string, UserRole> = { ...pendingRoles }
    for (const section of dirtyRoles) {
      const role = pendingRoles[section.workspaceId]
      let result = await setMemberRoleAction(workspaceId, { userId, workspaceId: section.workspaceId, role })
      if (!result.success && result.error === "last_reviewer_removal_requires_confirmation") {
        const ok = await confirm.ask({
          title: `Remove the last reviewer of ${section.workspaceName}?`,
          description: `${name} is the only reviewer. Until an owner assigns another, the owner signs off on close and approvals assigned to ${name} wait.`,
          confirmLabel: "Change role anyway", destructive: false, busyLabel: "Saving…",
        })
        confirm.close()
        if (!ok) { setStatus(`Saved ${savedCount} of ${total} — ${section.workspaceName} still unsaved`); break }
        result = await setMemberRoleAction(workspaceId, { userId, workspaceId: section.workspaceId, role, confirmLastReviewerRemoval: true })
      }
      if (!result.success || !result.data) {
        const code = result.error ?? "role_failed"
        if (code === "last_owner_required") delete remaining[section.workspaceId]
        setSectionErrors({ [section.workspaceId]: actionErrorText(code, { name, company: section.workspaceName }) })
        setSaveError(`Couldn't save the role in ${section.workspaceName}.`)
        break
      }
      savedCount += 1
      delete remaining[section.workspaceId]
      if (row.isViewer && section.workspaceId === currentWorkspaceId && result.data.previousRole === "owner" && role !== "owner") gaveUpCurrent = role
      else toast.success(`Role in ${section.workspaceName}: ${ROLE_LABELS[result.data.previousRole]} → ${ROLE_LABELS[role]}`)
    }
    let bankSaved = false
    if (bankDraft && savedCount === dirtyRoles.length && !gaveUpCurrent) {
      const details = bankDraft.bankName.trim() ? { bankName: bankDraft.bankName.trim(), accountNumber: bankDraft.accountNumber.replace(/\s+/g, ""), branchCode: bankDraft.branchCode.trim() } : null
      const result = await saveMemberBankDetailsAction(workspaceId, { userId, workspaceId: currentWorkspaceId, details })
      if (!result.success) {
        const code = result.error ?? "bank_failed"
        if (code === "invalid_bank_details") setBankErrors({ accountNumber: actionErrorText(code) })
        setSaveError(code === "bank_failed" ? "Couldn't save. Your entries are still here — try again." : actionErrorText(code, { name, company: currentCompanyName }))
      } else {
        bankSaved = true
        toast.success(`Bank details for ${currentCompanyName} saved`)
      }
    }
    setPendingRoles(remaining)
    if (bankSaved) setBankDraft(null)
    setSaving(false)
    if (savedCount > 0 || bankSaved) {
      setSavedAt(Date.now())
      refreshBoth()
    }
    if (gaveUpCurrent) toast.success(`You're now a ${ROLE_LABELS[gaveUpCurrent]} of ${currentCompanyName} — owners can change roles.`)
  }

  // ── Remove / Leave (§4.4) ──
  const removeFrom = useCallback(async (section: UserRowCompany) => {
    const self = row.isViewer
    const isCurrent = section.workspaceId === currentWorkspaceId
    const hasBank = isCurrent && !!row.bank
    const ok = await confirm.ask(self ? {
      title: `Leave ${section.workspaceName}?`,
      description: `You lose access to ${section.workspaceName} until an owner invites you again. Nothing is deleted.`,
      confirmLabel: "Leave company", destructive: true, busyLabel: "Leaving…",
    } : {
      title: `Remove ${name} from ${section.workspaceName}?`,
      description: `They lose access to ${section.workspaceName} — its documents, sheets and approvals — at once. Their access to other companies doesn't change. An owner can add them back later.${hasBank ? ` Their bank details for ${section.workspaceName} are deleted with it.` : ""}`,
      confirmLabel: "Remove from company", destructive: true, busyLabel: "Removing…",
    })
    if (!ok) return
    let result = await removeMemberAction(workspaceId, { userId, workspaceId: section.workspaceId })
    if (!result.success && result.error === "last_reviewer_removal_requires_confirmation") {
      const again = await confirm.escalate(`${name} is the only reviewer of ${section.workspaceName}. Until an owner assigns another, the owner signs off on close and approvals assigned to ${name} wait.`, self ? "Leave anyway" : "Remove anyway")
      if (!again) return
      result = await removeMemberAction(workspaceId, { userId, workspaceId: section.workspaceId, confirmLastReviewerRemoval: true })
    }
    if (!result.success || !result.data) {
      const code = result.error ?? "remove_failed"
      if (code === "last_owner_required" || code === "transfer_ownership_before_leaving" || code === "delete_workspace_instead") {
        confirm.refuse(self ? actionErrorText("transfer_ownership_before_leaving", { company: section.workspaceName }) : `${name} is the only owner of ${section.workspaceName}. Make someone else an owner first.`)
        return
      }
      confirm.fail(code === "remove_failed" ? "Nothing was changed — try again." : actionErrorText(code, { name, company: section.workspaceName }))
      return
    }
    confirm.close()
    if (self && isCurrent) {
      window.location.assign(`/workspaces?notice=left&name=${encodeURIComponent(section.workspaceName)}`)
      return
    }
    const snapshot = result.data
    const lastCompany = row.companies.length === 1
    if (self) toast.success(`You left ${section.workspaceName}`)
    else toast.success(`${name} removed from ${section.workspaceName}`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: async () => {
          const back = await addUserToCompanyAction(workspaceId, { userId, workspaceId: section.workspaceId, role: snapshot.role })
          if (!back.success) { toast.error(`Couldn't undo — ${actionErrorText(back.error ?? "add_failed", { name, company: section.workspaceName })}`); router.refresh(); return }
          if (snapshot.bank) {
            const restored = await saveMemberBankDetailsAction(workspaceId, { userId, workspaceId: section.workspaceId, details: snapshot.bank })
            if (!restored.success) toast.warning("Added back — bank details couldn't be restored, enter them again.")
          }
          router.refresh()
        },
      },
    })
    if (lastCompany) {
      helpers.close()
      router.refresh()
      window.requestAnimationFrame(() => document.getElementById("queue-title")?.focus())
    } else refreshBoth()
  }, [confirm, currentWorkspaceId, helpers, name, refreshBoth, router, row.bank, row.companies.length, row.isViewer, userId, workspaceId])

  const canLeaveCurrent = row.isViewer && current !== null && currentCompanyKind !== "personal" && !phone
  const latestLeave = useRef<() => void>(() => {})
  useEffect(() => { latestLeave.current = () => { if (current) void removeFrom(current) } }, [current, removeFrom])
  useEffect(() => {
    if (!register) return
    register(canLeaveCurrent ? { leave: () => latestLeave.current() } : {})
    return () => register(null)
  }, [register, canLeaveCurrent])

  // ── Tabs ──
  const tabId = (value: Tab) => `${baseId}-tab-${value}`
  const panelId = (value: Tab) => `${baseId}-panel-${value}`
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    let next: number | null = null
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = tabs.length - 1
    if (next === null) return
    event.preventDefault()
    tabs[next].focus()
    tabs[next].click()
  }
  const tabButton = (value: Tab, label: string, ariaLabel?: string) => <button type="button" role="tab" id={tabId(value)} aria-selected={tab === value} aria-controls={panelId(value)} aria-label={ariaLabel}
    tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
    className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${tab === value ? "border-emerald-700 text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{label}</button>
  const panelProps = (value: Tab) => ({ role: "tabpanel" as const, id: panelId(value), "aria-labelledby": tabId(value), hidden: tab !== value, tabIndex: 0 })

  const bankLine = row.bank ? `${row.bank.bankName} · ····${row.bank.lastFour}` : null
  const showBar = canEditAnyRole || canEditBank

  return <>
    <div role="tablist" aria-label="Sections" onKeyDown={onTabKeyDown} className="flex gap-4 border-b border-slate-200">
      {tabButton("information", "Information")}
      {tabButton("companies", `Companies, ${companies.length}`, `Companies, ${companies.length}`)}
    </div>

    <div {...panelProps("information")} className="flex flex-col gap-4 focus-visible:outline-none">
      <dl className="divide-y divide-slate-100 border-y border-slate-100">
        <Fact term="Name">{row.name?.trim() || "—"}</Fact>
        <Fact term="Email">{row.email}</Fact>
        <Fact term="Organization">{row.orgRole === "admin" ? "Org admin" : "—"}</Fact>
        <Fact term="Companies">{companies.length} · {companies.map((c) => c.workspaceName).join(", ")}</Fact>
        <Fact term={`Joined ${currentCompanyName}`}>{current ? formatDate(row.createdAt) : "Not in this company"}</Fact>
      </dl>

      {current && <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-slate-900">Bank details</legend>
        {bankDraft && canEditBank ? <>
          <BankField id={`${baseId}-bank-name`} label="Bank name" value={bankDraft.bankName} error={bankErrors.bankName} disabled={saving} onChange={(v) => setBankDraft({ ...bankDraft, bankName: v })} />
          <BankField id={`${baseId}-bank-account`} label="Account number" value={bankDraft.accountNumber} error={bankErrors.accountNumber} disabled={saving} inputMode="numeric" onChange={(v) => setBankDraft({ ...bankDraft, accountNumber: v })} />
          <BankField id={`${baseId}-bank-branch`} label="Branch code" value={bankDraft.branchCode} error={bankErrors.branchCode} disabled={saving} onChange={(v) => setBankDraft({ ...bankDraft, branchCode: v })} />
          <Consequence>Used only in payment files for {currentCompanyName}. Shown as bank and last four digits everywhere else.</Consequence>
        </> : <>
          <p className="text-sm text-slate-900">{bankLine ?? <span className="text-slate-600">None yet — needed before a reimbursement can be paid.</span>}</p>
          {canEditBank ? <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setBankDraft({ bankName: "", accountNumber: "", branchCode: "" }); setBankErrors({}) }}>{bankLine ? "Change…" : "Add bank details…"}</Button>
            {bankLine && <Button type="button" size="sm" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={async () => {
              const ok = await confirm.ask({
                title: `Remove ${name}'s bank details?`,
                description: `Claims already in a payment batch keep the details they were exported with. New claims will read "Needs bank details" on Bill Pay until they are entered again.`,
                confirmLabel: "Remove bank details", destructive: true, busyLabel: "Removing…",
              })
              if (!ok) return
              const result = await saveMemberBankDetailsAction(workspaceId, { userId, workspaceId: currentWorkspaceId, details: null })
              if (!result.success) { confirm.fail(result.error === "bank_failed" ? "Nothing was changed — try again." : actionErrorText(result.error ?? "bank_failed", { name, company: currentCompanyName })); return }
              confirm.close()
              toast.success(`Bank details for ${currentCompanyName} removed`)
              refreshBoth()
            }}>Remove…</Button>}
          </div> : <Consequence>Ask an owner: <span className="font-medium">{ownerNames(ownersByCompany[currentWorkspaceId])}</span> can change bank details, or {name} can under their Account.</Consequence>}
        </>}
        {companies.length > 1 && <Consequence>Bank details for other companies are set from within each company.</Consequence>}
      </fieldset>}
    </div>

    <div {...panelProps("companies")} className="flex flex-col gap-5 focus-visible:outline-none">
      {companies.map((section) => {
        const pending = pendingRoles[section.workspaceId] ?? section.role
        const editable = section.viewerOwns && !phone
        const selectId = `${baseId}-role-${section.workspaceId}`
        const reasonId = `${selectId}-reason`
        const errorId = `${selectId}-error`
        const otherOwners = ownersByCompany[section.workspaceId] ?? []
        const onlyOwner = row.isViewer && section.role === "owner" && otherOwners.length === 0
        const canRemove = editable && !onlyOwner && !(row.isViewer && currentCompanyKind === "personal" && section.workspaceId === currentWorkspaceId)
        const removeLabel = row.isViewer ? `Leave ${section.workspaceName}` : `Remove from ${section.workspaceName}`
        return <section key={section.workspaceId} aria-labelledby={`${selectId}-heading`} className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h3 id={`${selectId}-heading`} className="text-sm font-semibold text-slate-900">
              {section.workspaceName}{section.isCurrent && <span className="ml-2 text-xs font-normal text-slate-500">This company</span>}
            </h3>
            {editable && <Button type="button" size="sm" variant="ghost" disabled={!canRemove} aria-describedby={onlyOwner ? reasonId : undefined}
              aria-label={row.isViewer ? removeLabel : `Remove ${name} from ${section.workspaceName}`}
              className="h-8 gap-1.5 text-slate-700 hover:bg-red-50 hover:text-red-800" onClick={() => { void removeFrom(section) }}>
              <X aria-hidden className="h-3.5 w-3.5" /><span className="hidden md:inline">{removeLabel}</span>
            </Button>}
          </div>
          {editable ? <div className="flex flex-col gap-1.5">
            <label htmlFor={selectId} className="text-[13px] text-slate-600">Role in {section.workspaceName}</label>
            <NativeSelect id={selectId} value={pending} disabled={saving} className="h-8 w-[10rem]"
              aria-describedby={[onlyOwner ? reasonId : null, sectionErrors[section.workspaceId] ? errorId : null].filter(Boolean).join(" ") || undefined}
              onChange={(event) => setPendingRoles((prev) => ({ ...prev, [section.workspaceId]: event.target.value as UserRole }))}>
              {ROLES.map((role) => <option key={role} value={role} disabled={onlyOwner && role !== "owner"}>{ROLE_LABELS[role]}</option>)}
            </NativeSelect>
            <Consequence>{ROLE_CONSEQUENCE[pending](section.workspaceName)}</Consequence>
            {pending !== section.role && <p className="text-[13px] text-slate-600">Now: {ROLE_LABELS[section.role]}.</p>}
            {onlyOwner && <p id={reasonId} className="text-[13px] text-slate-600">You&apos;re the only owner of {section.workspaceName}. Make someone else an owner first.</p>}
            {sectionErrors[section.workspaceId] && <p id={errorId} role="alert" className="text-[13px] text-red-700">{sectionErrors[section.workspaceId]}</p>}
          </div> : <div className="flex flex-col gap-1">
            <p className="text-sm text-slate-900">{ROLE_LABELS[section.role]}</p>
            {phone && section.viewerOwns ? null : <Consequence>Ask an owner: <span className="font-medium">{ownerNames(otherOwners)}</span> can change this.</Consequence>}
          </div>}
        </section>
      })}
      {!phone && ownedCompanies.length > 0 && (eligible.length > 0
        ? <div><Button ref={addButtonRef} type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>Add to a company</Button></div>
        : <Consequence>{name} is in every company you own.</Consequence>)}
    </div>

    {showBar && <AdminSaveBar inPane dirty={dirty} pending={saving} error={saveError} savedAt={savedAt} status={status} saveButtonId="user-pane-save" saveButtonRef={saveButtonRef}
      onSave={() => { void save() }} onDiscard={discard} onSavedShown={() => setSavedAt(null)} shortcut={!adding} />}

    <AddToCompanyDialog open={adding} onClose={() => { setAdding(false); window.requestAnimationFrame(() => addButtonRef.current?.focus()) }}
      workspaceId={workspaceId} userId={userId} name={name} companies={eligible}
      onAdded={(company, role) => {
        setAdding(false)
        toast.success(`${name} added to ${company.name} as ${ROLE_LABELS[role]}`, {
          duration: UNDO_MS,
          action: {
            label: "Undo",
            onClick: async () => {
              const result = await removeMemberAction(workspaceId, { userId, workspaceId: company.workspaceId, confirmLastReviewerRemoval: true })
              if (!result.success) toast.error(`Couldn't undo — ${actionErrorText(result.error ?? "remove_failed", { name, company: company.name })}`)
              refreshBoth()
            },
          },
        })
        refreshBoth()
        window.requestAnimationFrame(() => addButtonRef.current?.focus())
      }} />
    {confirm.dialog}
  </>
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

/** Spec §4.2: commits at once from its own dialog — the consequence line says so. */
function AddToCompanyDialog({ open, onClose, workspaceId, userId, name, companies, onAdded }: {
  open: boolean
  onClose: () => void
  workspaceId: string
  userId: string
  name: string
  companies: { workspaceId: string; name: string }[]
  onAdded: (company: { workspaceId: string; name: string }, role: UserRole) => void
}) {
  // Mounted only while open so every opening starts from a fresh form (no reset effect).
  if (!open || companies.length === 0) return null
  return <AddToCompanyForm onClose={onClose} workspaceId={workspaceId} userId={userId} name={name} companies={companies} onAdded={onAdded} />
}

function AddToCompanyForm({ onClose, workspaceId, userId, name, companies, onAdded }: Omit<Parameters<typeof AddToCompanyDialog>[0], "open">) {
  const router = useRouter()
  const [companyId, setCompanyId] = useState(companies[0].workspaceId)
  const [role, setRole] = useState<UserRole>("member")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const company = companies.find((c) => c.workspaceId === companyId) ?? companies[0]
  return <Dialog open onClose={() => { if (!busy) onClose() }} title={`Add ${name} to a company`} initialFocus="#add-company-select">
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault()
      setBusy(true); setError(null)
      const result = await addUserToCompanyAction(workspaceId, { userId, workspaceId: company.workspaceId, role })
      setBusy(false)
      if (!result.success) {
        const code = result.error ?? "add_failed"
        if (code.startsWith("member_already_exists")) { setError(`${name} was just added to ${company.name} by someone else.`); router.refresh(); return }
        if (code.startsWith("owner_required")) { setError(`You're no longer an owner of ${company.name}.`); return }
        setError(code === "add_failed" ? "Couldn't add them. Your entries are still here — try again." : actionErrorText(code, { name, company: company.name }))
        return
      }
      onAdded(company, role)
    }}>
      <div className="space-y-1.5">
        <label htmlFor="add-company-select" className="text-sm font-medium text-slate-800">Company</label>
        <NativeSelect id="add-company-select" value={company.workspaceId} disabled={busy} onChange={(event) => setCompanyId(event.target.value)}>
          {companies.map((c) => <option key={c.workspaceId} value={c.workspaceId}>{c.name}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="add-company-role" className="text-sm font-medium text-slate-800">Role</label>
        <NativeSelect id="add-company-role" value={role} disabled={busy} className="w-[10rem]" onChange={(event) => setRole(event.target.value as UserRole)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </NativeSelect>
        <Consequence>{ROLE_CONSEQUENCE[role](company.name)}</Consequence>
      </div>
      <Consequence>{name} gets access at once — no invitation. Nothing is shared between companies.</Consequence>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Adding…" : "Add to company"}</Button>
      </div>
    </form>
  </Dialog>
}

"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { groupWorkspacesByOrg } from "@/lib/workspace-groups"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

export type SwitchableWorkspace = {
  id: string
  name: string
  kind: string
  role?: string
  organizationId?: string | null
  organizationName?: string | null
}

const ROLE_LABEL: Record<string, string> = { owner: "Owner", reviewer: "Reviewer", member: "Member" }

/** The sidebar's workspace chip. Replaces both the old `<select>` (which navigated to the
 * long-gone /sheet route) and the plain link list the sidebar rendered underneath the nav.
 *
 * `compact`: the sidebar's collapsed rail (`sidebar.tsx`'s `compact` — hover/focus-within to
 * expand). Unlike the old approach (the caller wrapping this whole component in `hidden
 * group-hover/rail:block`), the trigger button itself always renders so it stays focusable —
 * Radix's Escape/close focus-return needs a real, focusable trigger to land on regardless of
 * hover state (#287 close, F2: the old wrapper could hide the trigger mid-close and strand
 * focus on `body`). Only the name/kind text and chevron hide, same `group-hover/rail` /
 * `group-focus-within/rail` pattern the nav links use for their labels. */
export function WorkspaceSwitcher({ workspaces, workspaceId, compact = false }: { workspaces: SwitchableWorkspace[]; workspaceId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const current = workspaces.find((workspace) => workspace.id === workspaceId)
  const filtered = filter.trim()
    ? workspaces.filter((workspace) => workspace.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : workspaces
  const groups = groupWorkspacesByOrg(filtered)
  const revealClass = compact ? "hidden group-hover/rail:block group-focus-within/rail:block" : ""

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setFilter("") }}>
    <PopoverTrigger asChild>
      <button type="button" className="flex w-full items-center gap-2 rounded-[11px] border border-transparent px-2 py-[7px] text-left transition-colors hover:border-[#dbe3ea] hover:bg-white hover:shadow-[0_1px_3px_rgba(15,23,42,0.06)]" aria-label="Switch workspace">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[linear-gradient(135deg,#064e3b,#047857)] text-[11px] font-bold text-white shadow-[0_1px_2px_rgba(4,120,87,0.35)]">
          {(current?.name || "W").trim().charAt(0).toUpperCase()}
        </span>
        <span className={`min-w-0 flex-1 ${revealClass}`}>
          <span className="block truncate text-sm font-medium text-slate-800">{current?.name || "Workspace"}</span>
          <span className="block truncate text-xs text-slate-600">{current?.kind === "team" ? "Team workspace" : "Personal workspace"}</span>
        </span>
        <ChevronsUpDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 ${revealClass}`} />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-64 p-1.5">
      <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Workspaces</p>
      {workspaces.length > 6 && <input type="text" value={filter} onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter companies" aria-label="Filter companies"
        className="mb-1 w-full rounded-md border border-[#dbe3ea] px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary" />}
      <ul className="max-h-64 overflow-y-auto">
        {groups.map((group) => <li key={group.key}>
          {group.label && <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 first:pt-0">{group.label}</p>}
          <ul>
            {group.workspaces.map((workspace) => <li key={workspace.id}>
              <Link href={`/workspaces/${workspace.id}`} onClick={() => setOpen(false)}
                aria-current={workspace.id === workspaceId ? "true" : undefined}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-600">{workspace.name.trim().charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                {workspace.role && <span className="shrink-0 text-[11px] text-slate-600">{ROLE_LABEL[workspace.role] || workspace.role}</span>}
                <Check className={`h-3.5 w-3.5 shrink-0 text-primary ${workspace.id === workspaceId ? "" : "invisible"}`} />
              </Link>
            </li>)}
          </ul>
        </li>)}
      </ul>

      <div className="mt-1.5 border-t pt-1.5">
        <Link href="/workspaces/create" onClick={() => setOpen(false)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
          <Plus className="h-3.5 w-3.5 text-slate-400" />New workspace
        </Link>
      </div>
    </PopoverContent>
  </Popover>
}

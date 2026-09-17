"use client"

import type { CompanyRow, CompanyViewerRole } from "@/lib/admin/companies"

/** #285: the three page states the server page decides (spec §3.3). The list surface itself
 * (QueueScreen, dialogs, first-use states) is build step 4 — this file carries the contract the
 * page is wired to now, and step 4 replaces the body without touching the page. */
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

export function CompaniesQueue({ state }: CompaniesQueueProps) {
  const count = state.kind === "organization" ? state.rows.length : 0
  return <section aria-labelledby="queue-title" className="px-6 py-5">
    <h1 id="queue-title" className="text-lg font-semibold text-slate-900">Companies <span className="font-normal text-slate-600">{count} {count === 1 ? "company" : "companies"}</span></h1>
  </section>
}

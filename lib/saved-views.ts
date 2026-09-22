/** #201: pure saved-view logic shared by models/saved-views.ts (server) and
 * components/typed-destinations/saved-view-picker.tsx (client) — no prisma import here on
 * purpose, so the picker's "use client" bundle never pulls in @/lib/db. */

export type SavedViewFilters = Record<string, string>

export type SavedViewSeed = { name: string; filters: SavedViewFilters; scopeToCurrentUser?: boolean }

export type SavedViewSummary = {
  id: string
  name: string
  ownerId: string | null
  isSystem: boolean
  scopeToCurrentUser: boolean
  filters: SavedViewFilters
}

/** The seeded, non-editable views every screen ships with — "Duplicate as new view" is the only
 * way to get an editable copy of one. Keyed by the same `viewKey` vocabulary as
 * `UserListPreference.viewKey`. "Touchless" reuses the existing touchless-tier vocabulary rather
 * than inventing a second name for the autonomous-approval tier (map #177's Notes).
 *
 * #236 is the first screen to turn `scopeToCurrentUser` on for real: Approvals › Invoices' rows
 * carry a real Approver (CONTEXT.md), so "Ready to Approve" seeds with it true and an `approver:
 * me` filter alongside — the filter is what the query actually reads (same flat-string-map
 * mechanics every other view's filters use); the flag is the persisted, queryable fact that this
 * view is a personal one, for any reader that wants to tell personal and shared views apart
 * without parsing filters. */
export const SYSTEM_VIEWS_BY_VIEW_KEY: Record<string, ReadonlyArray<SavedViewSeed>> = {
  invoices: [
    { name: "All", filters: {} },
    { name: "Needs review", filters: { status: "unreviewed" } },
    { name: "Touchless", filters: { touchless: "1" } },
  ],
  receipts: [
    { name: "All", filters: {} },
    { name: "Needs review", filters: { status: "unreviewed" } },
    { name: "Touchless", filters: { touchless: "1" } },
  ],
  "approvals-invoices": [
    { name: "Ready to Approve", filters: { approver: "me" }, scopeToCurrentUser: true },
    { name: "All", filters: {} },
  ],
}

/** Creator-or-workspace-owner, matching #201's "Shared-view edit/delete: creator or workspace
 * admin/owner only" — this codebase's only role above "member"/"reviewer" is "owner", so "admin"
 * here means the workspace-role owner. System views are never editable by anyone, including an
 * owner. */
export function canEditSavedView(view: Pick<SavedViewSummary, "isSystem" | "ownerId">, actor: { userId: string; role: "owner" | "reviewer" | "member" }): boolean {
  if (view.isSystem) return false
  if (view.ownerId === actor.userId) return true
  return actor.role === "owner"
}

/** Only the creator can turn their own personal view into a shared one — not even a workspace
 * owner may share someone else's personal view on their behalf. */
export function canShareSavedView(view: Pick<SavedViewSummary, "isSystem" | "ownerId">, actor: { userId: string }): boolean {
  return !view.isSystem && view.ownerId === actor.userId
}

/** #201's "Save appears only when live filters diverge from the selected view" — shallow
 * key/value comparison since a filter payload is always a flat string map. */
export function filtersEqual(a: SavedViewFilters, b: SavedViewFilters): boolean {
  const aKeys = Object.keys(a).filter((k) => a[k] !== undefined && a[k] !== "")
  const bKeys = Object.keys(b).filter((k) => b[k] !== undefined && b[k] !== "")
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => a[key] === b[key])
}

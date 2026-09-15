/** #201: pure saved-view logic shared by models/saved-views.ts (server) and
 * components/typed-destinations/saved-view-picker.tsx (client) — no prisma import here on
 * purpose, so the picker's "use client" bundle never pulls in @/lib/db. */

export type SavedViewFilters = Record<string, string>

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
 * than inventing a second name for the autonomous-approval tier (map #177's Notes). There is no
 * personal-inbox ("assigned to me") system view yet: Invoices/Receipts rows carry no assignee
 * today, so `scopeToCurrentUser` is a real, working flag on the model with nothing yet to turn it
 * on for — left as fog rather than backed by data that doesn't exist. */
export const SYSTEM_VIEWS_BY_VIEW_KEY: Record<string, ReadonlyArray<{ name: string; filters: SavedViewFilters }>> = {
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

// Deliberately NOT a "use server" module, matching models/automation-rules.ts and
// models/documents.ts: these helpers trust the workspaceId/actor they are handed. Server actions
// upstream call requireWorkspaceRole first.
import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"
import { canEditSavedView, SYSTEM_VIEWS_BY_VIEW_KEY, type SavedViewFilters } from "@/lib/saved-views"

export type { SavedViewFilters, SavedViewSummary } from "@/lib/saved-views"
export { canEditSavedView, canShareSavedView, filtersEqual, SYSTEM_VIEWS_BY_VIEW_KEY } from "@/lib/saved-views"

/** #201: a named, savable set of columns/filters/sort for a list screen. `filters` is a flat
 * string map because every filter this map's typed surfaces support today (Invoices/Receipts'
 * Status, Invoice Approval, Claim, and Touchless chips) round-trips through a URL query string —
 * see FilterPanel's shareable-link mechanism, which selecting a view writes into. `columns`/`sort`
 * are carried as forward-compatible placeholders (`[]`/`null`): no list route customizes column
 * order or supports a sort control yet, same unwired state `UserListPreference` has held since the
 * pipeline redesign. */
export type SavedView = {
  id: string
  workspaceId: string
  viewKey: string
  name: string
  ownerId: string | null
  isSystem: boolean
  scopeToCurrentUser: boolean
  columns: string[]
  filters: SavedViewFilters
  sort: { field: string; direction: "asc" | "desc" } | null
  createdAt: Date
  updatedAt: Date
}

type SavedViewRow = Awaited<ReturnType<typeof prisma.savedView.findFirstOrThrow>>

function toSavedView(row: SavedViewRow): SavedView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    viewKey: row.viewKey,
    name: row.name,
    ownerId: row.ownerId,
    isSystem: row.isSystem,
    scopeToCurrentUser: row.scopeToCurrentUser,
    columns: (row.columns as string[] | null) ?? [],
    filters: (row.filters as SavedViewFilters | null) ?? {},
    sort: (row.sort as SavedView["sort"] | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Idempotent: `createMany`+`skipDuplicates` against the `(workspaceId, viewKey, name)` unique
 * index, so a concurrent first-load from two tabs never races into a duplicate-name error. Called
 * from `listSavedViews` rather than at workspace-creation time — a screen's system-view catalog is
 * code, not data, so it can change without a backfill. */
async function ensureSystemViewsSeeded(workspaceId: string, viewKey: string) {
  const seeds = SYSTEM_VIEWS_BY_VIEW_KEY[viewKey]
  if (!seeds?.length) return
  await prisma.savedView.createMany({
    skipDuplicates: true,
    data: seeds.map((seed) => ({
      workspaceId,
      viewKey,
      name: seed.name,
      isSystem: true,
      scopeToCurrentUser: seed.scopeToCurrentUser ?? false,
      columns: [] as unknown as Prisma.InputJsonValue,
      filters: seed.filters as unknown as Prisma.InputJsonValue,
      sort: Prisma.JsonNull,
    })),
  })
}

/** Every view a given user can see for this screen: the seeded system views, every
 * workspace-shared view (`ownerId: null`, `isSystem: false`), and the user's own personal views —
 * never another user's personal view. System views sort first, in seed order; the rest sort
 * alphabetically. */
export async function listSavedViews(input: { workspaceId: string; viewKey: string; userId: string }): Promise<SavedView[]> {
  await ensureSystemViewsSeeded(input.workspaceId, input.viewKey)
  const rows = await prisma.savedView.findMany({
    where: {
      workspaceId: input.workspaceId,
      viewKey: input.viewKey,
      OR: [{ isSystem: true }, { ownerId: null }, { ownerId: input.userId }],
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  })
  const systemOrder = new Map((SYSTEM_VIEWS_BY_VIEW_KEY[input.viewKey] ?? []).map((seed, index) => [seed.name, index]))
  const views = rows.map(toSavedView)
  views.sort((a, b) => {
    if (a.isSystem && b.isSystem) return (systemOrder.get(a.name) ?? 0) - (systemOrder.get(b.name) ?? 0)
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return views
}

async function requireEditableView(input: { workspaceId: string; viewId: string; actor: { userId: string; role: "owner" | "reviewer" | "member" } }) {
  const row = await prisma.savedView.findFirst({ where: { id: input.viewId, workspaceId: input.workspaceId } })
  if (!row) throw new Error("saved_view_not_found")
  const view = toSavedView(row)
  if (!canEditSavedView(view, input.actor)) throw new Error("saved_view_edit_forbidden")
  return view
}

/** A brand-new personal view, or the target of "Save current filters as a view" when no view is
 * selected yet. Always lands as the actor's own (`ownerId`) — sharing it workspace-wide is a
 * separate, explicit action (`shareSavedView`), never the default on create. */
export async function createSavedView(input: { workspaceId: string; viewKey: string; name: string; ownerId: string; filters: SavedViewFilters }) {
  const name = input.name.trim()
  if (!name) throw new Error("saved_view_name_required")
  try {
    const row = await prisma.savedView.create({
      data: {
        workspaceId: input.workspaceId, viewKey: input.viewKey, name,
        ownerId: input.ownerId, isSystem: false, scopeToCurrentUser: false,
        columns: [] as unknown as Prisma.InputJsonValue,
        filters: input.filters as unknown as Prisma.InputJsonValue,
        sort: Prisma.JsonNull,
      },
    })
    return toSavedView(row)
  } catch (error) {
    // Checked by shape rather than `instanceof Prisma.PrismaClientKnownRequestError`, matching
    // models/users.ts: that turns this module's type-only Prisma import into a runtime one, which
    // breaks vitest resolution of @/prisma/client for everything that imports this file.
    if ((error as { code?: string } | null)?.code !== "P2002") throw error
    throw new Error("saved_view_name_taken")
  }
}

/** "Duplicate as new view": forks any view (system or another user's shared one) into a new,
 * always-personal, always-editable copy — the only way #201 lets someone build on a view they
 * don't have edit rights to. */
export async function duplicateSavedView(input: { workspaceId: string; viewKey: string; sourceViewId: string; name: string; ownerId: string }) {
  const source = await prisma.savedView.findFirst({ where: { id: input.sourceViewId, workspaceId: input.workspaceId, viewKey: input.viewKey } })
  if (!source) throw new Error("saved_view_not_found")
  return createSavedView({ workspaceId: input.workspaceId, viewKey: input.viewKey, name: input.name, ownerId: input.ownerId, filters: (source.filters as SavedViewFilters | null) ?? {} })
}

/** Rename and/or replace the filter payload of an existing personal or shared view — the "Save"
 * affordance once live filters diverge from the selected view, for a view the actor is allowed to
 * edit in place (see `canEditSavedView`). */
export async function updateSavedView(input: { workspaceId: string; viewId: string; actor: { userId: string; role: "owner" | "reviewer" | "member" }; name?: string; filters?: SavedViewFilters }) {
  await requireEditableView({ workspaceId: input.workspaceId, viewId: input.viewId, actor: input.actor })
  const name = input.name?.trim()
  if (input.name !== undefined && !name) throw new Error("saved_view_name_required")
  try {
    const row = await prisma.savedView.update({
      where: { id: input.viewId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(input.filters !== undefined ? { filters: input.filters as unknown as Prisma.InputJsonValue } : {}),
      },
    })
    return toSavedView(row)
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "P2002") throw error
    throw new Error("saved_view_name_taken")
  }
}

/** #201's harden pass, "deleting the selected view": the caller (the picker's server action) is
 * responsible for redirecting to the workspace's "All" system view once this resolves — this
 * function only guarantees the row it deletes was never the last remaining system view (system
 * views can't be deleted at all) and never a view the actor lacked rights to. */
export async function deleteSavedView(input: { workspaceId: string; viewId: string; actor: { userId: string; role: "owner" | "reviewer" | "member" } }) {
  await requireEditableView({ workspaceId: input.workspaceId, viewId: input.viewId, actor: input.actor })
  await prisma.savedView.delete({ where: { id: input.viewId } })
}

/** Makes a personal view workspace-shared (`ownerId: null`). One-way in this ticket's scope — a
 * shared view already has "Duplicate as new view" as its personal-copy path, so un-sharing isn't
 * modeled separately. Only the view's own creator can share it. */
export async function shareSavedView(input: { workspaceId: string; viewId: string; actorId: string }) {
  const row = await prisma.savedView.findFirst({ where: { id: input.viewId, workspaceId: input.workspaceId } })
  if (!row) throw new Error("saved_view_not_found")
  if (row.isSystem) throw new Error("saved_view_edit_forbidden")
  if (row.ownerId !== input.actorId) throw new Error("saved_view_edit_forbidden")
  const updated = await prisma.savedView.update({ where: { id: input.viewId }, data: { ownerId: null } })
  return toSavedView(updated)
}

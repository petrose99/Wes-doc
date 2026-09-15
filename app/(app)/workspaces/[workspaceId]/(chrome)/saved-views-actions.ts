"use server"

import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole, type WorkspaceRole } from "@/models/workspaces"
import { createSavedView, duplicateSavedView, updateSavedView, deleteSavedView, shareSavedView, type SavedViewFilters } from "@/models/saved-views"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

/** #201's saved-views actions, shared by every typed list screen on the shared shell (today:
 * Invoices, Receipts). `basePath`/`viewKey` are bound server-side per route, matching
 * `preparePaymentRunAction`'s bind-then-pass-to-a-client-component shape in bills/page.tsx. */

function parseFilters(raw: FormDataEntryValue | null): SavedViewFilters {
  if (typeof raw !== "string" || !raw) return {}
  return Object.fromEntries(new URLSearchParams(raw).entries())
}

function viewUrl(basePath: string, viewId: string, filters: SavedViewFilters) {
  const search = new URLSearchParams(filters)
  search.set("view", viewId)
  return `${basePath}?${search.toString()}`
}

export async function createSavedViewAction(workspaceId: string, viewKey: string, basePath: string, formData: FormData) {
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  const name = String(formData.get("name") ?? "")
  const filters = parseFilters(formData.get("filters"))
  const view = await createSavedView({ workspaceId, viewKey, name, ownerId: user.id, filters })
  revalidatePath(basePath)
  redirect(viewUrl(basePath, view.id, filters))
}

export async function duplicateSavedViewAction(workspaceId: string, viewKey: string, basePath: string, formData: FormData) {
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  const sourceViewId = String(formData.get("sourceViewId") ?? "")
  const name = String(formData.get("name") ?? "")
  const view = await duplicateSavedView({ workspaceId, viewKey, sourceViewId, name, ownerId: user.id })
  revalidatePath(basePath)
  redirect(viewUrl(basePath, view.id, view.filters))
}

export async function renameSavedViewAction(workspaceId: string, basePath: string, formData: FormData) {
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const viewId = String(formData.get("viewId") ?? "")
  const name = String(formData.get("name") ?? "")
  const view = await updateSavedView({ workspaceId, viewId, actor: { userId: user.id, role: membership.role as WorkspaceRole }, name })
  revalidatePath(basePath)
  redirect(viewUrl(basePath, view.id, view.filters))
}

/** The "Save" affordance once live filters diverge from the selected view — updates that view's
 * filters in place rather than creating a new one. Only reachable for a view the actor can edit;
 * `updateSavedView` re-checks this itself. */
export async function saveFiltersToViewAction(workspaceId: string, basePath: string, formData: FormData) {
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const viewId = String(formData.get("viewId") ?? "")
  const filters = parseFilters(formData.get("filters"))
  const view = await updateSavedView({ workspaceId, viewId, actor: { userId: user.id, role: membership.role as WorkspaceRole }, filters })
  revalidatePath(basePath)
  redirect(viewUrl(basePath, view.id, view.filters))
}

export async function deleteSavedViewAction(workspaceId: string, basePath: string, formData: FormData) {
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const viewId = String(formData.get("viewId") ?? "")
  await deleteSavedView({ workspaceId, viewId, actor: { userId: user.id, role: membership.role as WorkspaceRole } })
  revalidatePath(basePath)
  // The deleted view can never be the selected one afterwards — back to the bare, view-less URL,
  // #201's "no true empty state" (the picker's own "All" system view is always seeded).
  redirect(basePath)
}

export async function shareSavedViewAction(workspaceId: string, basePath: string, formData: FormData) {
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  const viewId = String(formData.get("viewId") ?? "")
  const view = await shareSavedView({ workspaceId, viewId, actorId: user.id })
  revalidatePath(basePath)
  redirect(viewUrl(basePath, view.id, view.filters))
}

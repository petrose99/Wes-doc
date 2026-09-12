"use server"

import type { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { requireMember, NO_ACCESS } from "@/app/(app)/workspaces/[workspaceId]/action-helpers"
import {
  upsertCategoryNature,
  deleteCategoryNature,
  type CategoryNature,
} from "@/models/category-natures"
import { revalidatePath } from "next/cache"

async function guard(workspaceId: string): Promise<{ userId: string } | { error: string }> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { error: NO_ACCESS }
  return { userId: user.id }
}

export async function upsertCategoryNatureAction(
  workspaceId: string,
  category: string,
  nature: CategoryNature,
): Promise<ActionState<{ id: string }>> {
  const g = await guard(workspaceId)
  if ("error" in g) return { success: false, error: g.error }
  if (!category.trim()) return { success: false, error: "Category is required" }
  if (nature !== "goods" && nature !== "services") return { success: false, error: "Nature must be goods or services" }

  const row = await upsertCategoryNature(workspaceId, category, nature)
  revalidatePath(`/workspaces/${workspaceId}/settings/categories`)
  return { success: true, data: { id: row.id } }
}

export async function deleteCategoryNatureAction(
  workspaceId: string,
  id: string,
): Promise<ActionState> {
  const g = await guard(workspaceId)
  if ("error" in g) return { success: false, error: g.error }

  await deleteCategoryNature(workspaceId, id)
  revalidatePath(`/workspaces/${workspaceId}/settings/categories`)
  return { success: true }
}

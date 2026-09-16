"use server"

import type { ActionState } from "@/lib/actions"
import config from "@/lib/config"
import { getCurrentUser } from "@/lib/auth"
import { requireMember } from "@/app/(app)/workspaces/[workspaceId]/action-helpers"
import { workspaceIntegrationsPlanEnabled } from "@/models/integrations"
import { upsertCategoryAccountMapping, deleteCategoryAccountMapping } from "@/models/category-account-mappings"
import { revalidatePath } from "next/cache"

const NO_ACCESS = "You don't have access to this feature"

async function guard(workspaceId: string): Promise<{ userId: string } | { error: string }> {
  if (!config.integrations.enabled) return { error: NO_ACCESS }
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { error: NO_ACCESS }
  if (!(await workspaceIntegrationsPlanEnabled(workspaceId))) return { error: NO_ACCESS }
  return { userId: user.id }
}

export async function upsertMappingAction(
  workspaceId: string,
  connectionId: string,
  category: string,
  kind: string,
  accountExternalId: string,
): Promise<ActionState<{ id: string }>> {
  const g = await guard(workspaceId)
  if ("error" in g) return { success: false, error: g.error }
  if (!category.trim() || !accountExternalId.trim()) return { success: false, error: "Category and account are required" }

  const mapping = await upsertCategoryAccountMapping(workspaceId, connectionId, category.trim(), kind, accountExternalId.trim())
  revalidatePath(`/workspaces/${workspaceId}/settings/accounting-mapping`)
  return { success: true, data: { id: mapping.id } }
}

export async function deleteMappingAction(
  workspaceId: string,
  connectionId: string,
  mappingId: string,
): Promise<ActionState> {
  const g = await guard(workspaceId)
  if ("error" in g) return { success: false, error: g.error }

  await deleteCategoryAccountMapping(workspaceId, connectionId, mappingId)
  revalidatePath(`/workspaces/${workspaceId}/settings/accounting-mapping`)
  return { success: true }
}

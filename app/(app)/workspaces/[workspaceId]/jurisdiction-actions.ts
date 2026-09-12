"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { JURISDICTION_CODES, type JurisdictionCode } from "@/lib/jurisdictions"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { setWorkspaceJurisdiction, setWorkspaceDeferredVatScheme } from "@/models/jurisdictions"
import { revalidatePath } from "next/cache"
import { NO_ACCESS, paths, requireMember } from "./action-helpers"

/** Pick a workspace's jurisdiction (#49). Owner-only, finance-only, and only accepts codes
 * whose pack file resolves — the picker filters to those, but the server re-checks. */
export async function setJurisdictionAction(workspaceId: string, code: string): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  const membership = await requireMember(workspaceId, user.id, ["owner"])
  if (!membership) return { success: false, error: NO_ACCESS }
  if (!(await getWorkspaceCapabilities(workspaceId)).has("jurisdiction")) return { success: false, error: "Jurisdiction settings are only available in a finance-industry workspace." }
  if (!(JURISDICTION_CODES as readonly string[]).includes(code)) return { success: false, error: "Unknown jurisdiction" }

  try {
    await setWorkspaceJurisdiction(workspaceId, code as JurisdictionCode)
    revalidatePath(paths(workspaceId).tax)
    return { success: true, data: null }
  } catch (error) {
    // The pack-not-registered case (a code listed in JURISDICTION_CODES but with no PACK_LOADERS
    // entry yet) is a UI-vs-server race — the picker never offers such a code, but if it slipped
    // through we surface a clean message rather than a stack trace.
    const message = error instanceof Error ? error.message : "Could not change the jurisdiction"
    return { success: false, error: message.startsWith("No jurisdiction pack") ? "That jurisdiction isn't available yet." : "Could not change the jurisdiction" }
  }
}

/** #84: set the workspace's deferred-import-VAT scheme enrolment. Tri-state (`true` / `false` /
 * `null`). Owner-only, finance-only. Only LS's VAT-12 return-form workpaper reads it in v1 —
 * other packs ignore. */
export async function setDeferredVatSchemeAction(workspaceId: string, value: boolean | null): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  const membership = await requireMember(workspaceId, user.id, ["owner"])
  if (!membership) return { success: false, error: NO_ACCESS }
  if (!(await getWorkspaceCapabilities(workspaceId)).has("jurisdiction")) return { success: false, error: "Jurisdiction settings are only available in a finance-industry workspace." }
  if (value !== null && value !== true && value !== false) return { success: false, error: "Invalid value" }

  await setWorkspaceDeferredVatScheme(workspaceId, value)
  revalidatePath(paths(workspaceId).tax)
  return { success: true, data: null }
}

"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { addAllowedSender, removeAllowedSender } from "@/models/inbound-whatsapp"
import { revalidatePath } from "next/cache"
import { errorMessage, NO_ACCESS, paths, requireMember } from "./action-helpers"

export async function addWhatsAppSenderAction(workspaceId: string, formData: FormData): Promise<ActionState<{ id: string }>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: NO_ACCESS }
  const phoneNumber = String(formData.get("phoneNumber") || "").trim()
  const label = String(formData.get("label") || "").trim()
  const linkedMemberId = String(formData.get("linkedMemberId") || "").trim() || null
  if (!phoneNumber) return { success: false, error: "Enter a phone number" }
  if (!label) return { success: false, error: "Enter a name" }
  try {
    const row = await addAllowedSender({ workspaceId, phoneNumber, label, linkedMemberId, createdById: user.id })
    // Shares the Intake page's revalidation key with inbound email — both settings live on the
    // same page (app/(app)/workspaces/[workspaceId]/admin/configuration/intake).
    revalidatePath(paths(workspaceId).settingsEmail)
    return { success: true, data: { id: row.id } }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not add that sender") } }
}

export async function removeWhatsAppSenderAction(workspaceId: string, id: string): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: NO_ACCESS }
  try {
    await removeAllowedSender({ workspaceId, id, actorId: user.id })
    revalidatePath(paths(workspaceId).settingsEmail)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not remove that sender") } }
}

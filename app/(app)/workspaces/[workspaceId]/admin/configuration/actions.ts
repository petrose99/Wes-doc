"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth"
import type { ActionState } from "@/lib/actions"
import { isFieldTableType, isFieldWidth, lockedRequiredKeys, type FieldWidth } from "@/lib/configuration/field-table"
import { errorMessage, requireMember } from "@/app/(app)/workspaces/[workspaceId]/action-helpers"
import { fieldTableStamp, saveFieldTable } from "@/models/field-configs"

/** #231 Q11 (#252): saving Admin › Configuration › Fields. Owner-only; the whole table for one
 * type is replaced in one transaction; a table another owner saved since the page opened is
 * refused with `stale` so the page can say so instead of overwriting. */

const MESSAGES: Record<string, string> = {
  owner_only: "Only an owner can change configuration.",
  field_table_stale: "Configuration changed since you opened this page. Reload to see it, then reapply your edits.",
  field_table_type_invalid: "That document type has no field table.",
  field_table_row_invalid: "One of the rows could not be read. Reload and try again.",
}
const message = (error: unknown, fallback: string) => (error instanceof Error && MESSAGES[error.message]) || errorMessage(error, fallback)

export type SaveFieldTableInput = {
  workspaceId: string
  docType: string
  expectedUpdatedAt: string | null
  rows: { key: string; editable: boolean; required: boolean; width: string }[]
}

export async function saveFieldTableAction(input: SaveFieldTableInput): Promise<ActionState<{ stamp: string | null }>> {
  const user = await getCurrentUser()
  if (!(await requireMember(input.workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  if (!isFieldTableType(input.docType)) return { success: false, error: MESSAGES.field_table_type_invalid }
  const locked = lockedRequiredKeys(input.docType)
  const rows: { key: string; editable: boolean; required: boolean; width: FieldWidth }[] = []
  for (const row of input.rows) {
    if (typeof row.key !== "string" || !row.key || !isFieldWidth(row.width)) return { success: false, error: MESSAGES.field_table_row_invalid }
    const required = locked.has(row.key) || row.required === true
    // Required ⇒ Editable, enforced on the way in as well as in the editor.
    rows.push({ key: row.key, editable: row.editable === true || required, required, width: row.width })
  }
  try {
    await saveFieldTable({ workspaceId: input.workspaceId, actorId: user.id, docType: input.docType, rows, expectedUpdatedAt: input.expectedUpdatedAt })
  } catch (error) {
    return { success: false, error: message(error, "Couldn't save the field table — the server didn't say why. Your changes are still here.") }
  }
  revalidatePath(`/workspaces/${input.workspaceId}`, "layout")
  return { success: true, data: { stamp: await fieldTableStamp(input.workspaceId, input.docType) } }
}

"use server"

import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"
import { preparePaymentRun } from "@/models/payment-runs"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

/** WP-AP2: Bills-page server action to prepare a ZA EFT payment file from a set of bill IDs.
 * The action creates the PaymentRun + items and redirects to the download route, which
 * regenerates the CSV from the stored rows. Owner-only — payments are a controller action. */
export async function preparePaymentRunAction(workspaceId: string, formData: FormData) {
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  if (membership.role !== "owner") throw new Error("owner_only")

  const documentIds = formData.getAll("documentId").map(String).filter(Boolean)
  if (!documentIds.length) throw new Error("no_documents_selected")

  const { run } = await preparePaymentRun({ workspaceId, actorId: user.id, documentIds })
  revalidatePath(`/workspaces/${workspaceId}/bills`)
  redirect(`/api/workspaces/${workspaceId}/payment-runs/${run.id}/download`)
}

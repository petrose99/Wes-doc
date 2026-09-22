"use server"

import type { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { confirmPoMatch, listPoCandidates, rejectPoMatch, replacePoMatch, setPoLineAssignments, summarizeInvoicePoLinks, type InvoicePoSummary } from "@/models/po-matching"
import { revalidatePath } from "next/cache"
import { errorMessage, NO_ACCESS, paths, requireMember } from "./action-helpers"

/** #228 / #250: Match manually's server side. Every action is Server-confirmed (#228 Q14) — the
 * client changes nothing until the fresh summary comes back, so a refused or offline change
 * never shows a chip the server disagrees with. Any member who can edit the document may use
 * these (#228 Q13); an open Approval is sent back for review by the model layer. */

export type PoMatchActionData = { summary: InvoicePoSummary | null; sentBack: boolean }

function actorName(user: { name?: string | null; email?: string | null }): string {
  return user.name?.trim() || user.email || "a reviewer"
}

async function afterChange(workspaceId: string, invoiceId: string, sentBack: boolean): Promise<ActionState<PoMatchActionData>> {
  const summaries = await summarizeInvoicePoLinks(workspaceId, [invoiceId])
  revalidatePath(`${paths(workspaceId).documents}/${invoiceId}`)
  revalidatePath(`/workspaces/${workspaceId}/invoices`)
  revalidatePath(`/workspaces/${workspaceId}/purchase-orders`)
  return { success: true, data: { summary: summaries.get(invoiceId) ?? null, sentBack } }
}

export async function getInvoicePoSummaryAction(workspaceId: string, invoiceId: string): Promise<ActionState<InvoicePoSummary | null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  const summaries = await summarizeInvoicePoLinks(workspaceId, [invoiceId])
  return { success: true, data: summaries.get(invoiceId) ?? null }
}

export async function listPoCandidatesAction(workspaceId: string, invoiceId: string, query = ""): Promise<ActionState<Awaited<ReturnType<typeof listPoCandidates>>>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  return { success: true, data: await listPoCandidates(workspaceId, invoiceId, query.slice(0, 80)) }
}

export async function confirmPoMatchAction(workspaceId: string, invoiceId: string, matchId: string): Promise<ActionState<PoMatchActionData>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  try {
    const { sentBack } = await confirmPoMatch({ workspaceId, invoiceId, matchId, actorId: user.id, actorName: actorName(user) })
    return afterChange(workspaceId, invoiceId, sentBack)
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not confirm the Purchase Order") }
  }
}

export async function rejectPoMatchAction(workspaceId: string, invoiceId: string, matchId: string): Promise<ActionState<PoMatchActionData>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  try {
    const { sentBack } = await rejectPoMatch({ workspaceId, invoiceId, matchId, actorId: user.id, actorName: actorName(user) })
    return afterChange(workspaceId, invoiceId, sentBack)
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not reject the Purchase Order") }
  }
}

export async function replacePoMatchAction(workspaceId: string, invoiceId: string, poDocumentId: string): Promise<ActionState<PoMatchActionData>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  try {
    const { sentBack } = await replacePoMatch({ workspaceId, invoiceId, poDocumentId, actorId: user.id, actorName: actorName(user) })
    return afterChange(workspaceId, invoiceId, sentBack)
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not replace the Purchase Order") }
  }
}

export async function setPoLineAssignmentsAction(workspaceId: string, invoiceId: string, matchId: string, assignments: Record<string, number | null>): Promise<ActionState<PoMatchActionData>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  try {
    const { sentBack } = await setPoLineAssignments({ workspaceId, invoiceId, matchId, assignments, actorId: user.id, actorName: actorName(user) })
    return afterChange(workspaceId, invoiceId, sentBack)
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save the line matches") }
  }
}

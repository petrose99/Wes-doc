"use server"

import { revalidatePath } from "next/cache"
import { ZodError } from "zod"

import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"
import {
  createWarnCheck,
  deleteWarnCheck,
  dryRunWarnChecks,
  setWarnCheckEnabled,
  updateWarnCheck,
  WarnCheckValidationError,
  type CreateWarnCheckInput,
  type DryRunResult,
  type UpdateWarnCheckInput,
} from "@/models/warn-checks"

type Ok = { ok: true }
type Err = { error: string; field?: string }

function friendlyError(error: unknown): Err {
  if (error instanceof WarnCheckValidationError) {
    return { error: error.message, field: error.field }
  }
  if (error instanceof ZodError) {
    const first = error.issues[0]
    return { error: first?.message ?? "Some fields are invalid.", field: String(first?.path[0] ?? "") }
  }
  if (error instanceof Error && error.message === "Warn check not found") {
    return { error: "That rule no longer exists — it may have been deleted." }
  }
  return { error: "Couldn't save this warn check. Try again in a moment." }
}

export async function createWarnCheckAction(input: {
  workspaceId: string
  data: CreateWarnCheckInput
}): Promise<Ok | Err> {
  try {
    const user = await getCurrentUser()
    await requireWorkspaceRole(input.workspaceId, user.id, ["owner"])
    await createWarnCheck({ workspaceId: input.workspaceId, actorId: user.id, data: input.data })
    revalidatePath(`/workspaces/${input.workspaceId}/automation/warn-checks`)
    return { ok: true }
  } catch (error) {
    return friendlyError(error)
  }
}

export async function updateWarnCheckAction(input: {
  workspaceId: string
  id: string
  patch: UpdateWarnCheckInput
}): Promise<Ok | Err> {
  try {
    const user = await getCurrentUser()
    await requireWorkspaceRole(input.workspaceId, user.id, ["owner"])
    await updateWarnCheck({
      workspaceId: input.workspaceId,
      actorId: user.id,
      id: input.id,
      patch: input.patch,
    })
    revalidatePath(`/workspaces/${input.workspaceId}/automation/warn-checks`)
    return { ok: true }
  } catch (error) {
    return friendlyError(error)
  }
}

export async function setWarnCheckEnabledAction(input: {
  workspaceId: string
  id: string
  enabled: boolean
}): Promise<Ok | Err> {
  try {
    const user = await getCurrentUser()
    await requireWorkspaceRole(input.workspaceId, user.id, ["owner"])
    await setWarnCheckEnabled({
      workspaceId: input.workspaceId,
      actorId: user.id,
      id: input.id,
      enabled: input.enabled,
    })
    revalidatePath(`/workspaces/${input.workspaceId}/automation/warn-checks`)
    return { ok: true }
  } catch (error) {
    return friendlyError(error)
  }
}

export async function deleteWarnCheckAction(input: {
  workspaceId: string
  id: string
}): Promise<Ok | Err> {
  try {
    const user = await getCurrentUser()
    await requireWorkspaceRole(input.workspaceId, user.id, ["owner"])
    await deleteWarnCheck({ workspaceId: input.workspaceId, actorId: user.id, id: input.id })
    revalidatePath(`/workspaces/${input.workspaceId}/automation/warn-checks`)
    return { ok: true }
  } catch (error) {
    return friendlyError(error)
  }
}

/** Dry-run against the last 20 invoices. When `candidate` is set the admin is previewing an
 * unsaved rule; when it is absent the admin is previewing the current enabled set. */
export async function dryRunWarnChecksAction(input: {
  workspaceId: string
  candidate?: { name: string; whenExpr: string; message: string }
}): Promise<{ ok: true; results: DryRunResult[] } | Err> {
  try {
    const user = await getCurrentUser()
    await requireWorkspaceRole(input.workspaceId, user.id, ["owner"])
    const results = await dryRunWarnChecks({
      workspaceId: input.workspaceId,
      candidate: input.candidate,
    })
    return { ok: true, results }
  } catch (error) {
    return friendlyError(error)
  }
}

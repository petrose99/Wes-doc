"use server"

import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  CloseAlreadyOpenError,
  CloseLockBlockedByGatesError,
  currentSmbAttestation,
  lockClose,
  openClose,
  overrideCloseItem,
  recomputeClose,
  recordBankAssertion,
  relockClose,
  reopenClose,
  signCloseItem,
  unsignCloseItem,
} from "@/lib/close"
import { getWorkspaceMode } from "@/models/workspaces"
import { requireModule } from "@/lib/modules/capabilities"
import { requireWorkspaceRole } from "@/models/workspaces"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

/** #97: server actions for the close checklist page. Every action authenticates, scopes to
 * the workspace, and defers the real transition to lib/close — nothing here mutates rows
 * directly except through those functions. Lock/relock catch the hard-gate exception and
 * round-trip the blocking count through a search param, so the server component can render
 * the "N hard gates block this lock" notice without client state. */

async function requireCloseActor(workspaceId: string) {
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "close")
  return user
}

function closePath(workspaceId: string) {
  return `/workspaces/${workspaceId}/close`
}

function periodParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`
}

/** Verify the close item belongs to this workspace before any item-level mutation. */
async function requireWorkspaceItem(workspaceId: string, closeItemId: string) {
  const item = await prisma.closeItem.findUnique({
    where: { id: closeItemId },
    select: { workspaceId: true, close: { select: { periodYear: true, periodMonth: true } } },
  })
  if (!item || item.workspaceId !== workspaceId) throw new Error("close_item_not_in_workspace")
  return item
}

async function requireWorkspaceClose(workspaceId: string, closeId: string) {
  const close = await prisma.close.findUnique({
    where: { id: closeId },
    select: { workspaceId: true, periodYear: true, periodMonth: true },
  })
  if (!close || close.workspaceId !== workspaceId) throw new Error("close_not_in_workspace")
  return close
}

export async function openCloseAction(workspaceId: string, year: number, month: number) {
  const user = await requireCloseActor(workspaceId)
  try {
    await openClose({ workspaceId, year, month, actorId: user.id })
  } catch (error) {
    // Someone else opened it first — that period now exists, which is where we're headed anyway.
    if (!(error instanceof CloseAlreadyOpenError)) throw error
  }
  revalidatePath(closePath(workspaceId))
  redirect(`${closePath(workspaceId)}?period=${periodParam(year, month)}`)
}

export async function recomputeCloseAction(workspaceId: string, closeId: string) {
  const user = await requireCloseActor(workspaceId)
  const close = await requireWorkspaceClose(workspaceId, closeId)
  await recomputeClose({ closeId, actorId: user.id })
  revalidatePath(closePath(workspaceId))
  redirect(`${closePath(workspaceId)}?period=${periodParam(close.periodYear, close.periodMonth)}`)
}

async function performLockAction(workspaceId: string, closeId: string, relock: boolean) {
  const user = await requireCloseActor(workspaceId)
  const close = await requireWorkspaceClose(workspaceId, closeId)
  const period = periodParam(close.periodYear, close.periodMonth)
  let blockedGates: number | null = null
  try {
    if (relock) await relockClose({ closeId, actorId: user.id })
    else await lockClose({ closeId, actorId: user.id })
  } catch (error) {
    if (error instanceof CloseLockBlockedByGatesError) blockedGates = error.gateIds.length
    else throw error
  }
  revalidatePath(closePath(workspaceId))
  if (blockedGates !== null) redirect(`${closePath(workspaceId)}?period=${period}&blockedGates=${blockedGates}`)
  redirect(`${closePath(workspaceId)}?period=${period}`)
}

export async function lockCloseAction(workspaceId: string, closeId: string) {
  await performLockAction(workspaceId, closeId, false)
}

export async function relockCloseAction(workspaceId: string, closeId: string) {
  await performLockAction(workspaceId, closeId, true)
}

export async function reopenCloseAction(workspaceId: string, closeId: string, formData: FormData) {
  const user = await requireCloseActor(workspaceId)
  const close = await requireWorkspaceClose(workspaceId, closeId)
  const reason = String(formData.get("reason") ?? "").trim()
  if (!reason) throw new Error("reopen_reason_required")
  await reopenClose({ closeId, actorId: user.id, reason })
  revalidatePath(closePath(workspaceId))
  redirect(`${closePath(workspaceId)}?period=${periodParam(close.periodYear, close.periodMonth)}`)
}

export async function signCloseItemAction(workspaceId: string, closeItemId: string, formData?: FormData) {
  const user = await requireCloseActor(workspaceId)
  await requireWorkspaceItem(workspaceId, closeItemId)
  // SMB workspaces put the versioned checkbox above the button (#77); we accept it as a form
  // field but re-derive both text and version from source so a tampered client can't submit an
  // arbitrary attestation string. Firm mode ignores the field entirely — the server enforces the
  // rule, not the UI.
  const mode = await getWorkspaceMode(workspaceId)
  const ticked = mode === "smb" && formData?.get("attestation") === "on"
  if (mode === "smb" && !ticked) throw new Error("attestation_required")
  const attestation = ticked ? currentSmbAttestation() : undefined
  await signCloseItem({ closeItemId, actorId: user.id, attestation })
  revalidatePath(closePath(workspaceId))
}

export async function unsignCloseItemAction(workspaceId: string, closeItemId: string) {
  const user = await requireCloseActor(workspaceId)
  await requireWorkspaceItem(workspaceId, closeItemId)
  await unsignCloseItem({ closeItemId, actorId: user.id })
  revalidatePath(closePath(workspaceId))
}

export async function overrideCloseItemAction(workspaceId: string, closeItemId: string, formData: FormData) {
  const user = await requireCloseActor(workspaceId)
  await requireWorkspaceItem(workspaceId, closeItemId)
  const reason = String(formData.get("reason") ?? "").trim()
  if (!reason) throw new Error("override_reason_required")
  await overrideCloseItem({ closeItemId, actorId: user.id, reason })
  revalidatePath(closePath(workspaceId))
}

export async function assertBankBalanceAction(workspaceId: string, closeItemId: string, formData: FormData) {
  const user = await requireCloseActor(workspaceId)
  await requireWorkspaceItem(workspaceId, closeItemId)
  const raw = String(formData.get("assertedBalance") ?? "").trim().replace(/,/g, "")
  const assertedBalance = Number(raw)
  if (!raw || !Number.isFinite(assertedBalance)) throw new Error("asserted_balance_invalid")
  await recordBankAssertion({ closeItemId, actorId: user.id, assertedBalance })
  revalidatePath(closePath(workspaceId))
}

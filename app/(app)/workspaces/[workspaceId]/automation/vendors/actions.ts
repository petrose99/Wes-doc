"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/auth"
import { createAutomationRule, listPinnedRuleIdsBySupplier } from "@/models/automation-rules"
import { requireWorkspaceRole } from "@/models/workspaces"

/** Turn a vendor coding history row into an explicit AutomationRule so the pattern is a
 * committed workspace policy rather than a stat that could drift. Checks for an existing pin
 * first (same supplier, named "Pinned: <supplier>") and returns it instead of creating a second
 * rule — a duplicate pin used to sit silently alongside the first with no user-visible sign
 * anything had gone wrong. Owner-only. */
export async function pinVendorHistoryToRuleAction(input: {
  workspaceId: string
  supplier: string
  templateCode: string
  coding: Record<string, string>
}): Promise<{ ok: true; ruleId: string; alreadyPinned: boolean } | { error: string }> {
  try {
    const user = await getCurrentUser()
    await requireWorkspaceRole(input.workspaceId, user.id, ["owner"])
    const supplier = input.supplier.trim()
    if (!supplier) return { error: "This document has no supplier name to pin a rule to." }
    if (!Object.keys(input.coding).length) return { error: "There's no confirmed coding for this vendor yet — nothing to pin." }

    const existing = await listPinnedRuleIdsBySupplier(input.workspaceId)
    const existingId = existing.get(supplier)
    if (existingId) return { ok: true, ruleId: existingId, alreadyPinned: true }

    const rule = await createAutomationRule({
      workspaceId: input.workspaceId,
      name: `Pinned: ${supplier}`,
      matcher: { type: "exact", value: supplier },
      actions: { codingData: input.coding },
      requireReview: false,
      autopublish: false,
      createdById: user.id,
    })
    revalidatePath(`/workspaces/${input.workspaceId}/automation/vendors`)
    return { ok: true, ruleId: rule.id, alreadyPinned: false }
  } catch {
    return { error: "Couldn't pin this vendor as a rule. Try again in a moment." }
  }
}

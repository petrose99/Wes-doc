"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/auth"
import { createAutomationRule } from "@/models/automation-rules"
import { requireWorkspaceRole } from "@/models/workspaces"

/** Turn a vendor coding history row into an explicit AutomationRule so the pattern is a
 * committed workspace policy rather than a stat that could drift. Idempotent-ish: nothing stops
 * a workspace from pinning the same vendor twice — the second rule just sits alongside the
 * first, disabled or later merged by the workspace owner. Owner-only. */
export async function pinVendorHistoryToRuleAction(input: {
  workspaceId: string
  supplier: string
  templateCode: string
  coding: Record<string, string>
}): Promise<{ ok: true; ruleId: string } | { error: string }> {
  try {
    const user = await getCurrentUser()
    await requireWorkspaceRole(input.workspaceId, user.id, ["owner"])
    if (!input.supplier.trim()) return { error: "supplier_required" }
    if (!Object.keys(input.coding).length) return { error: "coding_required" }

    const rule = await createAutomationRule({
      workspaceId: input.workspaceId,
      name: `Pinned: ${input.supplier}`,
      matcher: { type: "exact", value: input.supplier.trim() },
      actions: { codingData: input.coding },
      requireReview: false,
      autopublish: false,
      createdById: user.id,
    })
    revalidatePath(`/workspaces/${input.workspaceId}/automation/vendors`)
    return { ok: true, ruleId: rule.id }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "pin_failed" }
  }
}

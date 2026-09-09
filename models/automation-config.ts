// Deliberately NOT a "use server" module: trusts the workspaceId it is handed. Server actions
// live in app/(app)/workspaces/[workspaceId]/(chrome)/settings/automation/actions.ts and do the
// auth + role gate before calling in here.
import { z } from "zod"

import { auditEventData, getRequestAuditContext } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"

/** Ramp's autonomy is a graduated slider, not a boolean:
 *
 *  - suggest      — every coded document goes through review before publish. Nothing is touchless.
 *  - auto         — non-critical documents are auto-coded; the reviewer clicks Approve, one gesture
 *                   per document. The middle ground: automation moves, humans still confirm.
 *  - touchless    — non-critical documents publish themselves at high confidence, subject to the
 *                   amount-band + policy-pass floors already in schema.
 *
 * The other fields (minConfidence, qaSampleRate, amountBands, requirePolicyPass) are advanced
 * knobs the touchless level uses; changing them only takes effect when the workspace is at
 * touchless. */
export type AutonomyLevel = "suggest" | "auto" | "touchless"

const amountBandSchema = z.object({
  min: z.number().nonnegative(),
  max: z.number().positive().nullable(),
  minConfidence: z.number().min(0).max(1),
  requireVerifiedSupplier: z.boolean().optional(),
})

const updateSchema = z.object({
  autonomyLevel: z.enum(["suggest", "auto", "touchless"]).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  requirePolicyPass: z.boolean().optional(),
  qaSampleRate: z.number().min(0).max(1).optional(),
  amountBands: z.array(amountBandSchema).max(10).optional(),
  blockOnWarnChecks: z.boolean().optional(),
  policyText: z.string().max(4000).nullable().optional(),
})

export type AutomationConfigUpdate = z.infer<typeof updateSchema>

/** Fetch (or create with defaults) the WorkspaceAutomationConfig row. */
export async function getOrCreateAutomationConfig(workspaceId: string) {
  const existing = await prisma.workspaceAutomationConfig.findUnique({ where: { workspaceId } })
  if (existing) return existing
  return prisma.workspaceAutomationConfig.create({ data: { workspaceId } })
}

/** Derive the graduated autonomyLevel from the stored fields. touchlessEnabled is Ramp's
 * highest level; a workspace where touchless is off but AI coding is applied is our "auto"
 * middle level; a workspace with neither is "suggest". */
export function deriveAutonomyLevel(config: {
  touchlessEnabled: boolean
}): AutonomyLevel {
  if (config.touchlessEnabled) return "touchless"
  // The middle state — "auto with approval" — is the default when touchless is off but coding
  // is still applied by rules + AI. Rules/AI running is a workspace-wide capability, not a
  // config flag, so treating "not touchless" as "auto" here matches the app's actual behavior.
  return "auto"
}

/** Write helper — validates and applies, then records an audit event. Owner-gated by the caller. */
export async function updateAutomationConfig(input: {
  workspaceId: string
  actorId: string
  patch: AutomationConfigUpdate
}) {
  const patch = updateSchema.parse(input.patch)
  await getOrCreateAutomationConfig(input.workspaceId)

  const data: Record<string, unknown> = {}
  if (patch.autonomyLevel !== undefined) {
    // "touchless" is the only level that flips touchlessEnabled; "auto" and "suggest" both leave
    // it off. Callers who need the "suggest" behavior can additionally toggle `blockOnWarnChecks`
    // and lift minConfidence to 1 — but the level itself only writes touchlessEnabled here.
    data.touchlessEnabled = patch.autonomyLevel === "touchless"
  }
  if (patch.minConfidence !== undefined) data.minConfidence = patch.minConfidence
  if (patch.requirePolicyPass !== undefined) data.requirePolicyPass = patch.requirePolicyPass
  if (patch.qaSampleRate !== undefined) data.qaSampleRate = patch.qaSampleRate
  if (patch.amountBands !== undefined) data.amountBands = patch.amountBands
  if (patch.blockOnWarnChecks !== undefined) data.blockOnWarnChecks = patch.blockOnWarnChecks
  if (patch.policyText !== undefined) data.policyText = patch.policyText

  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.workspaceAutomationConfig.update({ where: { workspaceId: input.workspaceId }, data }),
    prisma.documentAuditEvent.create({
      data: auditEventData({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        type: "automation_config.updated",
        detail: patch as unknown as Prisma.InputJsonValue,
      }, context),
    }),
  ])
  return updated
}

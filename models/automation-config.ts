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
}).refine((band) => band.max === null || band.max >= band.min, {
  message: "A band's \"Up to\" must be at least its \"From\".",
  path: ["max"],
})

/** #53 match-variance tolerance. `floor.currency` is optional — the gate resolves it against
 * `workspace.baseCurrency` at evaluation time when the setting doesn't pin one, so a
 * workspace that later changes its base currency doesn't need a manual re-save. */
const matchToleranceSchema = z.object({
  percent: z.number().min(0).max(1),
  floor: z.object({
    amount: z.number().nonnegative(),
    currency: z.string().length(3).optional(),
  }),
})

const updateSchema = z.object({
  autonomyLevel: z.enum(["suggest", "auto", "touchless"]).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  requirePolicyPass: z.boolean().optional(),
  qaSampleRate: z.number().min(0).max(1).optional(),
  amountBands: z.array(amountBandSchema).max(10).optional(),
  blockOnWarnChecks: z.boolean().optional(),
  policyText: z.string().max(4000).nullable().optional(),
  matchTolerance: matchToleranceSchema.optional(),
})

export type AutomationConfigUpdate = z.infer<typeof updateSchema>

/** Fetch (or create with defaults) the WorkspaceAutomationConfig row. */
export async function getOrCreateAutomationConfig(workspaceId: string) {
  const existing = await prisma.workspaceAutomationConfig.findUnique({ where: { workspaceId } })
  if (existing) return existing
  return prisma.workspaceAutomationConfig.create({ data: { workspaceId } })
}

/** Read the persisted autonomy level. Falls back to the legacy touchlessEnabled bool for
 * config rows written before autonomyLevel existed. */
export function deriveAutonomyLevel(config: {
  autonomyLevel?: string | null
  touchlessEnabled: boolean
}): AutonomyLevel {
  const stored = config.autonomyLevel
  if (stored === "suggest" || stored === "auto" || stored === "touchless") return stored
  return config.touchlessEnabled ? "touchless" : "auto"
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
    // Persist the choice AND the boolean it maps to — autopublish.ts still reads
    // touchlessEnabled directly, so we keep it in sync rather than migrating every read site
    // in one go. The stored autonomyLevel is what deriveAutonomyLevel reads back.
    data.autonomyLevel = patch.autonomyLevel
    data.touchlessEnabled = patch.autonomyLevel === "touchless"
  }
  if (patch.minConfidence !== undefined) data.minConfidence = patch.minConfidence
  if (patch.requirePolicyPass !== undefined) data.requirePolicyPass = patch.requirePolicyPass
  if (patch.qaSampleRate !== undefined) data.qaSampleRate = patch.qaSampleRate
  if (patch.amountBands !== undefined) data.amountBands = patch.amountBands
  if (patch.blockOnWarnChecks !== undefined) data.blockOnWarnChecks = patch.blockOnWarnChecks
  if (patch.policyText !== undefined) data.policyText = patch.policyText
  if (patch.matchTolerance !== undefined) data.matchTolerance = patch.matchTolerance as unknown as Prisma.InputJsonValue

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

  // #53 DoD: a tolerance change retroactively re-evaluates open match-variance exceptions.
  // Runs after the update commits so a downstream error can never leave the workspace with
  // fresh tolerance + stale exceptions. Import lazily so this file, imported from a "use
  // server" module chain, doesn't drag the gate runners into every automation-config caller.
  if (patch.matchTolerance !== undefined) {
    const { reevaluateOpenMatchVarianceGates } = await import("@/lib/gates/match-variance")
    await reevaluateOpenMatchVarianceGates(input.workspaceId)
  }
  return updated
}

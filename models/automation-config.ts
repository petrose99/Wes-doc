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

/** #55 confidence-per-band bands. `upTo: null` marks the open-ended top band; every other
 * row's `upTo` must be a positive number. `min` is the confidence floor (0–1). Sort order
 * is normalised at gate-eval time (see `coerceConfidenceBands`), so a workspace can save
 * rows in any order. */
const confidenceBandSchema = z.object({
  upTo: z.number().positive().nullable(),
  min: z.number().min(0).max(1),
})

/** #54 supplier-trust threshold. `currency` is optional — the gate resolves it against
 * `workspace.baseCurrency` at evaluation time when the setting doesn't pin one, so a
 * workspace that later changes its base currency doesn't need a manual re-save. */
const supplierTrustThresholdSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
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
  confidenceBands: z.array(confidenceBandSchema).max(10).optional(),
  supplierTrustThreshold: supplierTrustThresholdSchema.optional(),
  matchTolerance: matchToleranceSchema.optional(),
})

export type AutomationConfigUpdate = z.infer<typeof updateSchema>

/** Fetch (or create with defaults) the WorkspaceAutomationConfig row. */
export async function getOrCreateAutomationConfig(workspaceId: string) {
  const existing = await prisma.workspaceAutomationConfig.findUnique({ where: { workspaceId } })
  if (existing) return existing
  return prisma.workspaceAutomationConfig.create({ data: { workspaceId } })
}

/** #200: the Touchless pill's tooltip states the confidence floor plainly ("Sent automatically —
 * all fields ≥ N%"). A read-only percent, not the create-on-miss getOrCreateAutomationConfig — a
 * list-screen render should never have the side effect of writing a config row into existence.
 * Falls back to the schema's own default (0.85) for a workspace with no config row yet, same
 * number `WorkspaceAutomationConfig.minConfidence` defaults to. */
export async function getMinConfidencePercent(workspaceId: string): Promise<number> {
  const config = await prisma.workspaceAutomationConfig.findUnique({ where: { workspaceId }, select: { minConfidence: true } })
  return Math.round((config?.minConfidence ?? 0.85) * 100)
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
  if (patch.confidenceBands !== undefined)
    data.confidenceBands = patch.confidenceBands as unknown as Prisma.InputJsonValue
  if (patch.supplierTrustThreshold !== undefined)
    data.supplierTrustThreshold = patch.supplierTrustThreshold as unknown as Prisma.InputJsonValue
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

  // #53/#54/#55 DoD: a settings change retroactively re-evaluates the matching open
  // exceptions. Runs after the update commits so a downstream error can never leave the
  // workspace with a fresh setting + stale exceptions. Import lazily so this file, imported
  // from a "use server" module chain, doesn't drag the gate runners into every caller.
  if (patch.confidenceBands !== undefined) {
    const { reevaluateOpenConfidenceBandGates } = await import("@/lib/gates/confidence-band")
    await reevaluateOpenConfidenceBandGates(input.workspaceId)
  }
  if (patch.supplierTrustThreshold !== undefined) {
    const { reevaluateOpenSupplierTrustGates } = await import("@/lib/gates/supplier-trust")
    await reevaluateOpenSupplierTrustGates(input.workspaceId)
  }
  if (patch.matchTolerance !== undefined) {
    const { reevaluateOpenMatchVarianceGates } = await import("@/lib/gates/match-variance")
    await reevaluateOpenMatchVarianceGates(input.workspaceId)
  }
  return updated
}

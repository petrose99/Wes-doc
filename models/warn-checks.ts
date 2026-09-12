/** Model layer for workspace-authored warn checks (ticket #56).
 *
 * Deliberately NOT a "use server" module — trusts the workspaceId + actorId it is handed.
 * Server actions live in app/(app)/workspaces/[workspaceId]/automation/warn-checks/actions.ts
 * and do the auth + owner-role gate before calling in here. Same pattern as
 * models/automation-config.ts.
 *
 * The DSL is validated at every write (parseWarnCheck throws WarnCheckParseError on unknown
 * fields or malformed syntax). A predicate that can't be parsed at save time can't be reached
 * at evaluation time — the runner's parse fallback in lib/gates/warn-checks.ts exists for the
 * "backup from a prior release" case, not the "admin typed nonsense" case.
 *
 * Dry-run reads the most recent N invoices from this workspace and evaluates every enabled
 * rule against each, so an admin sees the actual match rate before turning a rule on. Reads
 * the same helpers (`buildWarnCheckContext`, `evaluateAllChecks`) the runner does — a
 * divergence would show up as "the dry-run said X but the runner did Y". */

import { z } from "zod"

import { auditEventData, getRequestAuditContext } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"
import {
  buildWarnCheckContext,
  evaluateAllChecks,
  type LoadedSupplier,
  type LoadedWarnCheck,
  type WarnCheckOutcome,
} from "@/lib/gates/warn-checks"
import { parseWarnCheck } from "@/lib/gates/warn-checks-evaluator"
import type { Prisma } from "@/prisma/client"

/** Maximums enforced at write time so a workspace can't push arbitrarily large payloads that
 * bloat the exception UI. Chosen for readability, not storage — 4 KB expressions and 1 KB
 * messages are plenty for the shapes admins are actually authoring. */
export const WARN_CHECK_NAME_MAX = 120
export const WARN_CHECK_EXPR_MAX = 4096
export const WARN_CHECK_MESSAGE_MAX = 1024
export const WARN_CHECK_DRY_RUN_SAMPLE = 20

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(WARN_CHECK_NAME_MAX),
  whenExpr: z.string().trim().min(1, "Expression is required").max(WARN_CHECK_EXPR_MAX),
  message: z.string().trim().min(1, "Message is required").max(WARN_CHECK_MESSAGE_MAX),
  enabled: z.boolean().optional(),
})

const updateSchema = z.object({
  name: z.string().trim().min(1).max(WARN_CHECK_NAME_MAX).optional(),
  whenExpr: z.string().trim().min(1).max(WARN_CHECK_EXPR_MAX).optional(),
  message: z.string().trim().min(1).max(WARN_CHECK_MESSAGE_MAX).optional(),
  enabled: z.boolean().optional(),
})

export type CreateWarnCheckInput = z.infer<typeof createSchema>
export type UpdateWarnCheckInput = z.infer<typeof updateSchema>

export class WarnCheckValidationError extends Error {
  readonly field: "whenExpr"
  constructor(field: "whenExpr", message: string) {
    super(message)
    this.name = "WarnCheckValidationError"
    this.field = field
  }
}

/** Reject any expression the parser cannot handle. Called from both create and update; the
 * server action catches this and returns it as a form validation error so the admin sees
 * "Unknown variable 'invoice_total'" next to the field, not a 500. */
function validateExpression(source: string) {
  try {
    parseWarnCheck(source)
  } catch (error) {
    throw new WarnCheckValidationError(
      "whenExpr",
      error instanceof Error ? error.message : "Expression is malformed",
    )
  }
}

export async function listWarnChecks(workspaceId: string) {
  return prisma.warnCheck.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      whenExpr: true,
      message: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  })
}

export async function createWarnCheck(input: {
  workspaceId: string
  actorId: string
  data: CreateWarnCheckInput
}) {
  const data = createSchema.parse(input.data)
  validateExpression(data.whenExpr)

  const context = await getRequestAuditContext()
  const [created] = await prisma.$transaction([
    prisma.warnCheck.create({
      data: {
        workspaceId: input.workspaceId,
        createdById: input.actorId,
        name: data.name,
        whenExpr: data.whenExpr,
        message: data.message,
        enabled: data.enabled ?? true,
      },
    }),
    prisma.documentAuditEvent.create({
      data: auditEventData(
        {
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          type: "warn_check.created",
          detail: data as unknown as Prisma.InputJsonValue,
        },
        context,
      ),
    }),
  ])
  return created
}

export async function updateWarnCheck(input: {
  workspaceId: string
  actorId: string
  id: string
  patch: UpdateWarnCheckInput
}) {
  const patch = updateSchema.parse(input.patch)
  if (patch.whenExpr !== undefined) validateExpression(patch.whenExpr)

  // Scoped update: the where clause carries workspaceId so a bug that swapped ids can't
  // mutate another workspace's row. RLS is the other belt; this is the suspenders.
  const existing = await prisma.warnCheck.findFirst({
    where: { id: input.id, workspaceId: input.workspaceId },
    select: { id: true },
  })
  if (!existing) throw new Error("Warn check not found")

  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.warnCheck.update({ where: { id: input.id }, data: patch }),
    prisma.documentAuditEvent.create({
      data: auditEventData(
        {
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          type: "warn_check.updated",
          detail: { id: input.id, patch } as unknown as Prisma.InputJsonValue,
        },
        context,
      ),
    }),
  ])
  return updated
}

export async function setWarnCheckEnabled(input: {
  workspaceId: string
  actorId: string
  id: string
  enabled: boolean
}) {
  return updateWarnCheck({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    id: input.id,
    patch: { enabled: input.enabled },
  })
}

export async function deleteWarnCheck(input: {
  workspaceId: string
  actorId: string
  id: string
}) {
  const existing = await prisma.warnCheck.findFirst({
    where: { id: input.id, workspaceId: input.workspaceId },
    select: { id: true, name: true },
  })
  if (!existing) throw new Error("Warn check not found")

  const context = await getRequestAuditContext()
  await prisma.$transaction([
    prisma.warnCheck.delete({ where: { id: input.id } }),
    prisma.documentAuditEvent.create({
      data: auditEventData(
        {
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          type: "warn_check.deleted",
          detail: existing as unknown as Prisma.InputJsonValue,
        },
        context,
      ),
    }),
  ])
}

// ---- Dry-run ------------------------------------------------------------------------------

export type DryRunResult = {
  documentId: string
  vendor: string | null
  total: number | null
  currency: string | null
  receivedAt: Date
  outcomes: WarnCheckOutcome[]
}

/** Run a candidate rule (or the whole enabled set) against the last N invoices and return
 * per-document outcomes. This is what powers the "would have fired on X of the last 20 bills"
 * hint on the admin form: an admin considering a new rule needs to know its match rate before
 * turning it on, or they end up authoring a rule that flags every bill.
 *
 * The `candidate` argument lets the admin dry-run a rule they haven't saved yet. When it is
 * present, the dry-run evaluates ONLY the candidate; when it is absent, it evaluates every
 * currently-enabled rule (useful to preview the effect of disabling one). */
export async function dryRunWarnChecks(input: {
  workspaceId: string
  candidate?: { name: string; whenExpr: string; message: string }
  now?: Date
}): Promise<DryRunResult[]> {
  let checks: LoadedWarnCheck[]
  if (input.candidate) {
    // Validate up front so a syntactically-broken candidate returns a parse error, not N rows
    // of "errored" outcomes.
    validateExpression(input.candidate.whenExpr)
    checks = [
      {
        id: "candidate",
        name: input.candidate.name,
        whenExpr: input.candidate.whenExpr,
        message: input.candidate.message,
      },
    ]
  } else {
    checks = await prisma.warnCheck.findMany({
      where: { workspaceId: input.workspaceId, enabled: true },
      select: { id: true, name: true, whenExpr: true, message: true },
      orderBy: { createdAt: "asc" },
    })
  }

  const documents = await prisma.document.findMany({
    where: { workspaceId: input.workspaceId, docType: "invoice" },
    orderBy: { receivedAt: "desc" },
    take: WARN_CHECK_DRY_RUN_SAMPLE,
    select: {
      id: true,
      workspaceId: true,
      docType: true,
      fieldSnapshot: true,
      receivedAt: true,
    },
  })

  const now = input.now ?? new Date()
  const results: DryRunResult[] = []
  for (const doc of documents) {
    const snapshot =
      doc.fieldSnapshot && typeof doc.fieldSnapshot === "object" && !Array.isArray(doc.fieldSnapshot)
        ? (doc.fieldSnapshot as Record<string, unknown>)
        : {}
    const vendorRaw = snapshot.vendor ?? snapshot.supplier
    const vendor = typeof vendorRaw === "string" && vendorRaw.trim().length > 0 ? vendorRaw.trim() : null
    const supplier: LoadedSupplier = vendor
      ? await prisma.supplier.findUnique({
          where: {
            workspaceId_normalizedKey: {
              workspaceId: input.workspaceId,
              normalizedKey: normalizeSupplierName(vendor),
            },
          },
          select: { id: true },
        })
      : null

    const ctx = buildWarnCheckContext({
      document: doc as Parameters<typeof buildWarnCheckContext>[0]["document"],
      supplier,
      now,
    })
    const outcomes = evaluateAllChecks(checks, ctx)
    const totalRaw = snapshot.total
    const total =
      typeof totalRaw === "number" && Number.isFinite(totalRaw)
        ? totalRaw
        : typeof totalRaw === "string"
          ? (() => {
              const n = Number(totalRaw.replace(/[,\s]/g, ""))
              return Number.isFinite(n) ? n : null
            })()
          : null
    const currencyRaw = snapshot.currency
    const currency = typeof currencyRaw === "string" && currencyRaw.length > 0 ? currencyRaw : null

    results.push({
      documentId: doc.id,
      vendor,
      total,
      currency,
      receivedAt: doc.receivedAt,
      outcomes,
    })
  }
  return results
}

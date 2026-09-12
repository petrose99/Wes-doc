/** Gate 6/6 from decision #40: workspace-authored warn checks (ticket #56). Soft, extensible.
 *
 * The other five gates ship rules the workspace CAN'T re-word. This one is the extensibility
 * point on top of them: the workspace declares its own soft-gate rules ("warn checks"), each a
 * predicate over a fixed field set (see warn-checks-evaluator.ts) plus a message shown to the
 * reviewer when it matches.
 *
 * Design decisions that shape this file:
 *
 *  - **One Gate row per document, not per rule.** The registry's contract is "one runner, one
 *    verdict"; we could work around it, but reviewers actually want to see all firings from
 *    this gate as a single item in the exception queue with a list of what triggered — they
 *    dismiss all-or-none for the current arrival. The payload carries the per-rule matches so
 *    the UI can render each check's own message and the audit trail records exactly which
 *    rules fired.
 *
 *  - **A rule that errors passes silently for that document.** A predicate that references
 *    something the runner cannot fill (edge case a fresh migration left null) shouldn't
 *    block the bill or crash the registry — it logs and moves on. The rule-level catch is
 *    inside this runner; the registry's own catch is one level up.
 *
 *  - **A rule that fails to parse never runs.** `WorkspaceWarnCheck.whenExpr` is validated at
 *    save time, so this should be impossible; but if a DB was ever loaded from a backup that
 *    predates the parser, the runner treats an unparseable rule the same as a rule that
 *    errored — silent skip, error logged.
 *
 *  - **Deps injection.** `loadEnabledChecks` + `loadSupplier` are handed to the runner so
 *    tests build their own rule sets and supplier state without touching Prisma. The default
 *    export wires the real reads.
 *
 * Payload shape: `{ matches: [{ checkId, name, message }...] }`. The exception queue keys on
 * `checkId` to link back into the admin UI ("this fired — jump to the rule that emitted it").
 */

import { prisma } from "@/lib/db"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"
import type { GateContext, GateRunner, GateVerdict } from "./types"
import type { Prisma, PrismaClient } from "@/prisma/client"

import {
  parseWarnCheck,
  evaluateWarnCheck,
  WarnCheckEvalError,
  WarnCheckParseError,
  type Expr,
  type WarnCheckContext,
} from "./warn-checks-evaluator"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export const WARN_CHECKS_GATE_TYPE = "warn-checks"

type FieldSnapshot = Record<string, unknown>

function readSnapshot(document: GateContext["document"]): FieldSnapshot {
  const snapshot = document.fieldSnapshot
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as FieldSnapshot)
    : {}
}

function readString(snapshot: FieldSnapshot, key: string): string | null {
  const value = snapshot[key]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function readNumber(snapshot: FieldSnapshot, key: string): number | null {
  const value = snapshot[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,\s]/g, ""))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readDueDate(snapshot: FieldSnapshot): Date | null {
  const raw = snapshot.dueDate ?? snapshot.due_date ?? snapshot.due
  if (typeof raw !== "string" || raw.length === 0) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Days from `now` to the due date, rounded toward zero. Negative when the bill is overdue.
 * Kept exported so a test can assert the arithmetic without going through the whole runner. */
export function computeDaysToDue(dueDate: Date | null, now: Date): number | null {
  if (dueDate === null) return null
  const ms = dueDate.getTime() - now.getTime()
  return Math.trunc(ms / (1000 * 60 * 60 * 24))
}

/** One warn check as the runner needs it — the raw whenExpr, the message to show when it
 * fires, plus the id (so the exception UI can link back into the admin). We parse whenExpr
 * once per invocation of `run()`, not once per document lifetime, because a rule the admin
 * just edited should apply on the next arrival without a process restart. */
export type LoadedWarnCheck = {
  id: string
  name: string
  whenExpr: string
  message: string
}

export type LoadedSupplier =
  | { id: string }
  | null

export type WarnChecksDeps = {
  loadEnabledChecks(workspaceId: string): Promise<LoadedWarnCheck[]>
  loadSupplier(input: { workspaceId: string; normalizedKey: string }): Promise<LoadedSupplier>
  now?: () => Date
}

/** One rule's outcome, whether it fired, skipped, or errored. Exposed for the dry-run
 * feature: the admin UI needs to render "would have fired on 3 of the last 20 bills" and
 * that count comes from filtering these outcomes, not from re-running the runner. */
export type WarnCheckOutcome =
  | { checkId: string; name: string; status: "fired"; message: string }
  | { checkId: string; name: string; status: "passed" }
  | { checkId: string; name: string; status: "errored"; error: string }

/** Pure — evaluates every rule against a pre-built context. Broken out so the runner and the
 * dry-run feature share the same evaluation loop; nothing in here touches the database. */
export function evaluateAllChecks(
  checks: LoadedWarnCheck[],
  ctx: WarnCheckContext,
): WarnCheckOutcome[] {
  const outcomes: WarnCheckOutcome[] = []
  for (const check of checks) {
    let expr: Expr
    try {
      expr = parseWarnCheck(check.whenExpr)
    } catch (error) {
      const message =
        error instanceof WarnCheckParseError ? error.message : "Unknown parse error"
      outcomes.push({
        checkId: check.id,
        name: check.name,
        status: "errored",
        error: `parse: ${message}`,
      })
      continue
    }
    try {
      const fired = evaluateWarnCheck(expr, ctx)
      if (fired) {
        outcomes.push({
          checkId: check.id,
          name: check.name,
          status: "fired",
          message: check.message,
        })
      } else {
        outcomes.push({ checkId: check.id, name: check.name, status: "passed" })
      }
    } catch (error) {
      const message =
        error instanceof WarnCheckEvalError ? error.message : "Unknown evaluation error"
      outcomes.push({
        checkId: check.id,
        name: check.name,
        status: "errored",
        error: `eval: ${message}`,
      })
    }
  }
  return outcomes
}

/** Build the evaluator context from a Document + its supplier. Exposed so the dry-run and the
 * runner share the same shape; a bug in one would immediately show up in the other. */
export function buildWarnCheckContext(input: {
  document: GateContext["document"]
  supplier: LoadedSupplier
  now: Date
}): WarnCheckContext {
  const snapshot = readSnapshot(input.document)
  return {
    total: readNumber(snapshot, "total"),
    currency: readString(snapshot, "currency"),
    supplierKnown: input.supplier !== null,
    category: readString(snapshot, "category"),
    description: readString(snapshot, "description"),
    vatRate: readNumber(snapshot, "vatRate"),
    daysToDue: computeDaysToDue(readDueDate(snapshot), input.now),
  }
}

export function createWarnChecksGateRunner(deps: WarnChecksDeps): GateRunner {
  return {
    gateType: WARN_CHECKS_GATE_TYPE,
    async run(ctx): Promise<GateVerdict> {
      if (ctx.document.docType !== "invoice") return { blocked: false }

      const checks = await deps.loadEnabledChecks(ctx.workspaceId)
      if (checks.length === 0) return { blocked: false }

      const snapshot = readSnapshot(ctx.document)
      const vendorName = readString(snapshot, "vendor") ?? readString(snapshot, "supplier")
      const supplier = vendorName
        ? await deps.loadSupplier({
            workspaceId: ctx.workspaceId,
            normalizedKey: normalizeSupplierName(vendorName),
          })
        : null

      const now = (deps.now ?? (() => new Date()))()
      const evalCtx = buildWarnCheckContext({ document: ctx.document, supplier, now })
      const outcomes = evaluateAllChecks(checks, evalCtx)

      const fired = outcomes.filter((o): o is Extract<WarnCheckOutcome, { status: "fired" }> => o.status === "fired")
      // Errored rules go to the log so the admin can find them; they never block a bill.
      for (const errored of outcomes) {
        if (errored.status === "errored") {
          console.error(
            `[warn-checks] rule "${errored.name}" (${errored.checkId}) errored on document ${ctx.documentId}: ${errored.error}`,
          )
        }
      }
      if (fired.length === 0) return { blocked: false }

      return {
        blocked: true,
        severity: "soft",
        payload: {
          matches: fired.map((f) => ({ checkId: f.checkId, name: f.name, message: f.message })),
        },
      }
    },
  }
}

async function loadEnabledChecksFromDb(
  workspaceId: string,
  client: PrismaLike = prisma,
): Promise<LoadedWarnCheck[]> {
  const rows = await client.warnCheck.findMany({
    where: { workspaceId, enabled: true },
    select: { id: true, name: true, whenExpr: true, message: true },
    orderBy: { createdAt: "asc" },
  })
  return rows
}

async function loadSupplierFromDb(
  input: { workspaceId: string; normalizedKey: string },
  client: PrismaLike = prisma,
): Promise<LoadedSupplier> {
  const supplier = await client.supplier.findUnique({
    where: {
      workspaceId_normalizedKey: {
        workspaceId: input.workspaceId,
        normalizedKey: input.normalizedKey,
      },
    },
    select: { id: true },
  })
  return supplier
}

/** The runner registered into gateRegistry. */
export const warnChecksGateRunner: GateRunner = createWarnChecksGateRunner({
  loadEnabledChecks: (workspaceId) => loadEnabledChecksFromDb(workspaceId),
  loadSupplier: (input) => loadSupplierFromDb(input),
})

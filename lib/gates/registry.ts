/** The shared run loop for the six #40 gates. Each `GateRunner` (lib/gates/types.ts) registers a
 * `gateType`; the registry calls every registered runner on document arrival, upserts a Gate row
 * for each `{ blocked: true }` verdict, and emits `gate.blocked` via `writeAuditEvent`. This is
 * the whole scaffolding — a concrete gate ticket (#51–#56) is one runner file plus its tests.
 *
 * The registry is a plain in-process Map keyed by `gateType`. Tests build their own registry via
 * `createGateRegistry()` (never mutating the global `gateRegistry`) so a synthetic runner never
 * leaks into another test — same pattern as lib/approvals/engine.ts's zero-side-effects design.
 * A runner registered twice throws: the run loop assumes one runner per `gateType`. */

import { prisma } from "@/lib/db"
import { writeAuditEvent } from "@/lib/audit"
import type { GateContext, GateRunner, GateVerdict } from "./types"
import type { Prisma, PrismaClient, Gate } from "@/prisma/client"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export type GateRegistry = {
  register(runner: GateRunner): void
  /** Test-only surface for asserting on registration state. Not used at runtime. */
  list(): readonly GateRunner[]
  /** Run every registered runner against the context and persist any blocked verdicts. Returns
   * the Gate rows that were written or upserted, so the AP-inbound caller can decide whether to
   * hold the bill in the exception queue. An empty registry is a no-op and returns `[]`, which
   * is how `createIngestionItem` remains unchanged when this scaffolding lands. */
  runOnArrival(ctx: GateContext, client?: PrismaLike): Promise<Gate[]>
}

export function createGateRegistry(): GateRegistry {
  const runners = new Map<string, GateRunner>()

  return {
    register(runner) {
      if (runners.has(runner.gateType)) {
        throw new Error(`Gate "${runner.gateType}" is already registered — one runner per gateType`)
      }
      runners.set(runner.gateType, runner)
    },
    list() {
      return Array.from(runners.values())
    },
    async runOnArrival(ctx, client = prisma) {
      if (runners.size === 0) return []
      const written: Gate[] = []
      for (const runner of runners.values()) {
        // Each runner is isolated: a throw from one must not stop the others. A gate that
        // errored gets skipped (logged) rather than pretending the bill is clean — a concrete
        // gate ticket owns its own error handling; the registry just refuses to bring the
        // whole ingestion down for it.
        let verdict: GateVerdict
        try {
          verdict = await runner.run(ctx)
        } catch (error) {
          console.error(
            `[gates] runner "${runner.gateType}" threw on document ${ctx.documentId}:`,
            error instanceof Error ? error.message : error,
          )
          continue
        }
        if (!verdict.blocked) continue
        const row = await upsertGate(client, ctx, runner.gateType, verdict)
        written.push(row)
        await writeAuditEvent(
          {
            workspaceId: ctx.workspaceId,
            actorId: null,
            type: "gate.blocked",
            subjectType: "gate",
            subjectId: row.id,
            payload: {
              gateType: runner.gateType,
              documentId: ctx.documentId,
              severity: verdict.severity,
              ...(verdict.payload ?? {}),
            },
          },
          client,
        )
      }
      return written
    },
  }
}

/** Upsert by (documentId, gateType) — a re-fire (extraction retried, re-uploaded bytes) replaces
 * the prior row rather than stacking. The `state` is reset to "blocked" on any re-fire: a
 * previously overridden gate whose underlying condition has re-appeared is a fresh finding, and
 * the workspace must see it again. */
async function upsertGate(
  client: PrismaLike,
  ctx: GateContext,
  gateType: string,
  verdict: Extract<GateVerdict, { blocked: true }>,
): Promise<Gate> {
  return client.gate.upsert({
    where: { documentId_gateType: { documentId: ctx.documentId, gateType } },
    create: {
      workspaceId: ctx.workspaceId,
      documentId: ctx.documentId,
      gateType,
      severity: verdict.severity,
      state: "blocked",
      payload: (verdict.payload ?? null) as Prisma.InputJsonValue,
    },
    update: {
      severity: verdict.severity,
      state: "blocked",
      firedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      overrideReason: null,
      payload: (verdict.payload ?? null) as Prisma.InputJsonValue,
    },
  })
}

/** The process-wide registry every concrete gate ticket registers into. Kept as a module-level
 * singleton (not a class) so the import graph gives us "register once at module load"; tests
 * that need isolation reach for `createGateRegistry()` directly. */
export const gateRegistry: GateRegistry = createGateRegistry()

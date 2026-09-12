/** Shared types for the six touchless-AP gates from decision ticket #40. Every gate — duplicate,
 * jurisdiction validity, 2/3-way match, supplier trust, confidence-per-band, warn-checks — is a
 * `GateRunner` registered into lib/gates/registry.ts. The registry does the persistence and the
 * audit-event emission; a runner is pure decision logic (`GateContext` in, `GateVerdict` out) with
 * no Prisma import, so it can be unit-tested against constructed inputs the same way
 * lib/approvals/engine.ts is.
 *
 * The Gate row and its `gate.blocked` / `gate.overridden` / `gate.resolved` audit events are the
 * registry's contract with the outside world; the verdict shape below is the registry's contract
 * with the runners. */

import type { Document } from "@/prisma/client"

/** What a runner is handed for one document arrival. Deliberately narrow — the more it takes, the
 * more work a fresh gate ticket (#51–#56) has to do to construct one in tests. Runners that need
 * additional data (supplier history for duplicate, prior extractions for match) reach for their
 * own model helpers; the registry never fetches that eagerly.
 *
 * `workspaceId` and `documentId` are split out for the registry's own bookkeeping — it upserts a
 * Gate row by (documentId, gateType) and needs both without re-reading the Document. */
export type GateContext = {
  workspaceId: string
  documentId: string
  document: Pick<Document, "id" | "workspaceId" | "docType" | "fieldSnapshot" | "receivedAt"> &
    Partial<Document>
}

/** What a runner returns. Two shapes: `{ blocked: false }` means the gate had nothing to say; the
 * registry writes nothing for it. `{ blocked: true, ... }` means the gate found a reason to hold
 * the bill — the registry upserts a Gate row and emits `gate.blocked`. `payload` is per-gate and
 * carries whatever the UI or a later resolve/override needs to understand the finding (the
 * winning bill's id for duplicate, the failed invoice-check ids for jurisdiction, the variance
 * amount for match, and so on).
 *
 * Severity is set by the runner, not the caller — it is a property of the gate itself. #40 fixed
 * duplicate + jurisdiction as hard; match / trust / confidence / warn as soft. */
export type GateVerdict =
  | { blocked: false }
  | { blocked: true; severity: "hard" | "soft"; payload?: Record<string, unknown> }

/** A gate runner: pure decision logic. Registered into the registry with its own kebab-case
 * `gateType` string — "duplicate", "jurisdiction", "match", "trust", "confidence", "warn-checks".
 * The runner never persists anything itself; the registry writes the Gate row and emits the
 * audit event, so a runner remains testable against synthetic contexts. */
export type GateRunner = {
  gateType: string
  run(ctx: GateContext): Promise<GateVerdict> | GateVerdict
}

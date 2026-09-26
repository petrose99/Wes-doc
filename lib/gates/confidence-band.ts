/** Gate 5/6 from decision #40: confidence-per-band. Soft, workspace-tunable.
 *
 * Rule (from #40 + #55): a bill whose extraction confidence falls below the workspace's
 * per-band threshold fires a soft gate. Bands are amount buckets (0–500 / 500–5k / 5k+ by
 * seed) each with their own confidence floor (0.85 / 0.92 / 1.00 seed). The idea is that a
 * $5,000 bill deserves stricter automation confidence than a $50 lunch receipt — the same
 * shape as the autopublish `amountBands` in lib/readiness/amount-band.ts, kept as its own
 * setting because the two answers different questions: readiness relaxes the auto-publish
 * floor, this gate holds bills that miss the floor in the exception queue.
 *
 * Confidence signal: the runner reads `document.confidence.fieldConfidence` (the per-field
 * map extraction writes) and takes the min. Falls back to `document.codingConfidence` (the
 * AI-coding scalar) when no field map exists. When neither is present, the rule silently
 * passes — it has no signal to reason about, and that's a different gate's problem to
 * surface.
 *
 * Testability: the runner takes `getBands` as a dep, so tests build their own band tables
 * without mocking Prisma. Default export wires the real WorkspaceAutomationConfig read.
 *
 * Payload shape: `{ overallConfidence, bandMin, bandUpTo, invoiceTotal, currency }`. The
 * UI keys on `bandMin` to explain why the bill was held ("confidence 0.83 below 0.92 for
 * $500–$5,000 bills"). */

import { prisma } from "@/lib/db"
import { resolveGate } from "@/lib/gates/actions"
import { getCompanyCurrency } from "@/models/company-currency"
import type { GateContext, GateRunner, GateVerdict } from "./types"
import type { Prisma, PrismaClient, Document } from "@/prisma/client"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export const CONFIDENCE_BAND_GATE_TYPE = "confidence-band"

/** One band in the workspace-configured table. `upTo` is an inclusive upper amount for this
 * band; `upTo: null` marks the open-ended top band ("everything above the last bounded
 * band"). `min` is the confidence floor a bill must clear to bypass this gate.
 *
 * A `min` of 1.00 is legal and means "this band is effectively opt-out from automation" —
 * every bill in the range gets held for review no matter what confidence the extractor
 * reported. */
export type ConfidenceBand = {
  upTo: number | null
  min: number
}

/** #40's seed policy, applied when a workspace has never edited the setting or writes
 * something malformed. Kept alongside the runtime coerce so a test can assert the exact
 * seed shape from #40 without re-reading the migration. */
export const DEFAULT_CONFIDENCE_BANDS: ConfidenceBand[] = [
  { upTo: 500, min: 0.85 },
  { upTo: 5000, min: 0.92 },
  { upTo: null, min: 1.0 },
]

export type ConfidenceBandDeps = {
  getBands(workspaceId: string): Promise<ConfidenceBand[]>
}

type FieldSnapshot = Record<string, unknown>

function readSnapshot(document: GateContext["document"]): FieldSnapshot {
  const snapshot = document.fieldSnapshot
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as FieldSnapshot)
    : {}
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

/** Coerce whatever the JSON column carries into a well-ordered band table. Silently drops
 * malformed rows and falls back to the seed when the coercion leaves nothing valid. The
 * result is always sorted by `upTo` ascending (nulls last), so `bandFor()` can walk it
 * once. A workspace that removes every band gets the seed back — the point of #40 is that
 * the gate has SOMETHING to compare against; an empty table would let every bill through
 * silently, which is worse than seed defaults. */
export function coerceConfidenceBands(raw: unknown): ConfidenceBand[] {
  if (!Array.isArray(raw)) return DEFAULT_CONFIDENCE_BANDS
  const parsed: ConfidenceBand[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    const row = entry as Record<string, unknown>
    const upTo =
      row.upTo === null
        ? null
        : typeof row.upTo === "number" && Number.isFinite(row.upTo) && row.upTo > 0
          ? row.upTo
          : undefined
    if (upTo === undefined) continue
    if (typeof row.min !== "number" || !Number.isFinite(row.min) || row.min < 0 || row.min > 1) continue
    parsed.push({ upTo, min: row.min })
  }
  if (parsed.length === 0) return DEFAULT_CONFIDENCE_BANDS
  return sortBands(parsed)
}

function sortBands(bands: ConfidenceBand[]): ConfidenceBand[] {
  return [...bands].sort((a, b) => {
    if (a.upTo === null && b.upTo === null) return 0
    if (a.upTo === null) return 1
    if (b.upTo === null) return -1
    return a.upTo - b.upTo
  })
}

/** Pure — pick the band this bill falls into. Walks in ascending `upTo` order; the first
 * band whose `upTo` is `null` or `>= amount` wins. When the table's top band is not open-
 * ended (`upTo != null`) and the amount exceeds it, we fall through and return `null` —
 * the runner treats that as a silent pass so a truncated table doesn't fire on every
 * large bill. `coerceConfidenceBands` guards against the empty-table case by falling back
 * to the seed; this is the "workspace typed a bounded top band then a bill exceeded it"
 * case. */
export function bandFor(amount: number, bands: ConfidenceBand[]): ConfidenceBand | null {
  if (!Number.isFinite(amount) || amount < 0) return null
  const sorted = sortBands(bands)
  for (const band of sorted) {
    if (band.upTo === null) return band
    if (amount <= band.upTo) return band
  }
  return null
}

/** Extract a single overall confidence score for the bill. Prefers the per-field map
 * (extraction pipeline's own signal) with a min-across-fields; falls back to
 * codingConfidence. `null` means "no confidence data" — the runner silently passes.
 *
 * Kept exported so tests can assert the extraction logic independently of the runner. */
export function readOverallConfidence(document: GateContext["document"]): number | null {
  const rawConfidence = (document as Partial<Document>).confidence
  if (rawConfidence && typeof rawConfidence === "object" && !Array.isArray(rawConfidence)) {
    const fieldConfidence = (rawConfidence as Record<string, unknown>).fieldConfidence
    if (fieldConfidence && typeof fieldConfidence === "object" && !Array.isArray(fieldConfidence)) {
      const values: number[] = []
      for (const value of Object.values(fieldConfidence as Record<string, unknown>)) {
        if (typeof value === "number" && Number.isFinite(value)) values.push(value)
      }
      if (values.length > 0) return Math.min(...values)
    }
  }
  const coding = (document as Partial<Document>).codingConfidence
  if (typeof coding === "number" && Number.isFinite(coding)) return coding
  return null
}

export function createConfidenceBandGateRunner(deps: ConfidenceBandDeps): GateRunner {
  return {
    gateType: CONFIDENCE_BAND_GATE_TYPE,
    async run(ctx): Promise<GateVerdict> {
      if (ctx.document.docType !== "invoice") return { blocked: false }

      const snapshot = readSnapshot(ctx.document)
      const invoiceTotal = readNumber(snapshot, "total")
      // Without a total we can't pick a band — silent pass. Matches supplier-trust / match-
      // variance's short-circuit on missing total: the extraction pipeline is expected to
      // fill it, and if it never does, that's not this gate's problem to raise.
      if (invoiceTotal === null) return { blocked: false }

      const overall = readOverallConfidence(ctx.document)
      // No confidence signal at all: silent pass. The document either predates the
      // confidence-emitting extractor or is a shape (rules-only coding, manual entry) this
      // gate is not designed to judge.
      if (overall === null) return { blocked: false }

      const bands = await deps.getBands(ctx.workspaceId)
      const band = bandFor(Math.abs(invoiceTotal), bands)
      if (!band) return { blocked: false }

      if (overall >= band.min) return { blocked: false }

      const baseCurrency = ctx.baseCurrency
      return {
        blocked: true,
        severity: "soft",
        payload: {
          overallConfidence: overall,
          bandMin: band.min,
          bandUpTo: band.upTo,
          invoiceTotal,
          currency: baseCurrency,
        },
      }
    },
  }
}

async function getWorkspaceConfidenceBands(
  workspaceId: string,
  client: PrismaLike = prisma,
): Promise<ConfidenceBand[]> {
  const config = await client.workspaceAutomationConfig.findUnique({
    where: { workspaceId },
    select: { confidenceBands: true },
  })
  return coerceConfidenceBands(config?.confidenceBands ?? null)
}

/** The runner registered into gateRegistry. */
export const confidenceBandGateRunner: GateRunner = createConfidenceBandGateRunner({
  getBands: (workspaceId) => getWorkspaceConfidenceBands(workspaceId),
})

/** Re-run the gate for one document, auto-resolving an open gate whose bill now clears the
 * band's floor (band widened, or seed adjusted). Refreshes the payload when still blocking.
 * Overridden gates are skipped — an override is an intentional human decision that a later
 * config change shouldn't silently rewrite (same policy as #53 / #54). */
export async function reevaluateConfidenceBandForDocument(
  input: { workspaceId: string; documentId: string },
  client: PrismaLike = prisma,
): Promise<{ outcome: "resolved" | "still-blocking" | "no-op" }> {
  const gate = await client.gate.findUnique({
    where: {
      documentId_gateType: { documentId: input.documentId, gateType: CONFIDENCE_BAND_GATE_TYPE },
    },
  })
  if (!gate) return { outcome: "no-op" }
  if (gate.state !== "blocked") return { outcome: "no-op" }

  const doc = await client.document.findUnique({
    where: { id: input.documentId },
    select: {
      id: true,
      workspaceId: true,
      docType: true,
      fieldSnapshot: true,
      receivedAt: true,
      confidence: true,
      codingConfidence: true,
    },
  })
  if (!doc) return { outcome: "no-op" }

  const verdict = await confidenceBandGateRunner.run({
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    document: doc as GateContext["document"],
    baseCurrency: await getCompanyCurrency(input.workspaceId, client),
  })
  if (!verdict.blocked) {
    await resolveGate(
      { gateId: gate.id, actorId: null, reason: "confidence-band re-evaluated" },
      client,
    )
    return { outcome: "resolved" }
  }
  await client.gate.update({
    where: { id: gate.id },
    data: {
      severity: verdict.severity,
      payload: (verdict.payload ?? null) as Prisma.InputJsonValue,
    },
  })
  return { outcome: "still-blocking" }
}

/** Workspace-wide sweep. Called from the settings server action after the bands change;
 * walks every open confidence-band gate and either resolves or refreshes it. Same "only
 * touch open" scope as #53 / #54 — a tightening band never faults previously-passing
 * bills, and overridden gates are left alone. */
export async function reevaluateOpenConfidenceBandGates(
  workspaceId: string,
  client: PrismaLike = prisma,
): Promise<{ resolved: number; stillBlocking: number }> {
  const rows = await client.gate.findMany({
    where: { workspaceId, gateType: CONFIDENCE_BAND_GATE_TYPE, state: "blocked" },
    select: { id: true, documentId: true },
  })
  let resolved = 0
  let stillBlocking = 0
  for (const row of rows) {
    const { outcome } = await reevaluateConfidenceBandForDocument(
      { workspaceId, documentId: row.documentId },
      client,
    )
    if (outcome === "resolved") resolved += 1
    else if (outcome === "still-blocking") stillBlocking += 1
  }
  return { resolved, stillBlocking }
}

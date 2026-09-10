// Deliberately NOT a "use server" module, matching models/document-checks.ts: this trusts the
// workspaceId/documentId it is handed. Called from the extract worker (lib/document-processing.ts),
// which has already authorised the document by construction.
import { track } from "@/lib/analytics"
import { prisma } from "@/lib/db"
import { resolveDocumentMatches } from "@/lib/matching/resolve"
import type { MatchResult } from "@/lib/matching/engine"
import { createReviewTask } from "@/models/review-tasks"
import { emitAccountsPayableEvent } from "@/lib/webhooks"
import { kickWebhookDrain } from "@/lib/webhook-delivery"
import { Prisma } from "@/prisma/client"

/** WP-AP1: post-extraction 2/3-way matching hook. Runs the matcher over blocking candidates,
 * upserts DocumentMatch rows (resolveDocumentMatches handles that), and elevates any match that
 * came back with discrepancies into a `three_way_match_discrepancy` DocumentCheckResult + one
 * open ReviewTask — the same shape runDeterministicChecks uses for its own findings, so the
 * review UI, health dashboard, and check webhooks all handle it without new plumbing.
 *
 * Never throws past the caller — matching is a post-extraction side effect and a lookup failure
 * must not fail the pipeline (same contract as runDeterministicChecks). */
export async function runDocumentMatching(input: { workspaceId: string; documentId: string }): Promise<MatchResult[]> {
  try {
    const results = await resolveDocumentMatches(input.workspaceId, input.documentId)
    const withDiscrepancies = results.filter((r) => r.discrepancies.length > 0)
    if (withDiscrepancies.length) {
      await persistDiscrepancyCheck(input.workspaceId, input.documentId, withDiscrepancies)
      // WP-AP1: match.discrepancy webhook, one event per matched target with a discrepancy.
      // Best-effort — never throws past runDocumentMatching.
      let anyQueued = false
      for (const match of withDiscrepancies) {
        try {
          const emitted = await emitAccountsPayableEvent(prisma, {
            workspaceId: input.workspaceId,
            createdAt: new Date(),
            event: {
              type: "match.discrepancy",
              documentId: input.documentId,
              data: { matched_document_id: match.targetId, match_type: match.matchType, confidence: match.confidence, discrepancies: match.discrepancies },
            },
          })
          if (emitted.queued > 0) anyQueued = true
        } catch (error) {
          console.error("[matching] match.discrepancy webhook emit failed:", error instanceof Error ? error.message : error)
        }
      }
      if (anyQueued) await kickWebhookDrain().catch(() => {})
    } else {
      // A clean run clears any stale discrepancy row from a prior extraction.
      await prisma.documentCheckResult
        .deleteMany({ where: { documentId: input.documentId, checkCode: "three_way_match_discrepancy" } })
        .catch(() => {})
    }
    return results
  } catch (error) {
    console.error("[matching] failed to run document matching:", error instanceof Error ? error.message : error)
    return []
  }
}

async function persistDiscrepancyCheck(workspaceId: string, documentId: string, matches: MatchResult[]): Promise<void> {
  const detail = {
    matches: matches.map((m) => ({
      targetId: m.targetId,
      matchType: m.matchType,
      confidence: m.confidence,
      discrepancies: m.discrepancies,
    })),
  }
  const message = `${matches.length} matching document${matches.length === 1 ? "" : "s"} with discrepancies (${matches.map((m) => m.discrepancies.map((d) => d.field).join(",")).join("; ")})`
  await prisma.documentCheckResult.upsert({
    where: { documentId_checkCode: { documentId, checkCode: "three_way_match_discrepancy" } },
    create: { workspaceId, documentId, checkCode: "three_way_match_discrepancy", status: "warn", message, detail: detail as unknown as Prisma.InputJsonValue },
    update: { status: "warn", message, detail: detail as unknown as Prisma.InputJsonValue },
  })
  await track("document_check_failed", { documentId, checkCode: "three_way_match_discrepancy", status: "warn" }, { workspaceId })
  const existing = await prisma.reviewTask.findFirst({
    where: { workspaceId, documentId, reason: "check_failed", status: { in: ["open", "in_review"] }, detail: { contains: "three_way_match_discrepancy" } },
    select: { id: true },
  })
  if (!existing) {
    await createReviewTask({ workspaceId, documentId, reason: "check_failed", detail: `three_way_match_discrepancy: ${message}`, priority: 0, createdById: null })
  }
}

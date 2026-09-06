// A5.9 active-learning loop, DB side. Owns the SupplierMatchLabel table backing the labelling
// UI, and computes new proposed thresholds from those labels through the pure ranker in
// lib/suppliers/active-learning.ts. Deliberately NOT a "use server" module — trusts the
// workspaceId it's handed.
import { prisma } from "@/lib/db"
import { optimalThresholds, sampleUncertainPairs, type PairCandidate, type PairLabel } from "@/lib/suppliers/active-learning"
import { tokenSetRatio } from "@/lib/suppliers/normalize"

/** Sample the workspace's next N labelling tasks — pairs of suppliers whose token-set ratio
 * sits closest to the review/auto boundary. Deterministic per (workspace, N) — a reviewer
 * reopening the page gets the same list. */
export async function nextLabellingTasks(workspaceId: string, count = 20): Promise<Array<{ pairId: string; supplierA: { id: string; name: string }; supplierB: { id: string; name: string }; score: number }>> {
  const suppliers = await prisma.supplier.findMany({
    where: { workspaceId },
    select: { id: true, canonicalName: true, normalizedKey: true },
    take: 500,
  })
  if (suppliers.length < 2) return []
  const alreadyLabelled = new Set((await prisma.supplierMatchLabel.findMany({ where: { workspaceId }, select: { pairId: true } })).map((l) => l.pairId))

  const candidates: Array<PairCandidate & { supplierA: typeof suppliers[number]; supplierB: typeof suppliers[number] }> = []
  for (let i = 0; i < suppliers.length; i++) {
    for (let j = i + 1; j < suppliers.length; j++) {
      const pairId = `${suppliers[i].id}|${suppliers[j].id}`
      if (alreadyLabelled.has(pairId)) continue
      const score = tokenSetRatio(suppliers[i].normalizedKey, suppliers[j].normalizedKey)
      if (score === 0) continue
      candidates.push({ pairId, score, supplierA: suppliers[i], supplierB: suppliers[j] })
    }
  }
  const chosen = sampleUncertainPairs(candidates, count)
  return chosen.map((c) => {
    const full = candidates.find((cand) => cand.pairId === c.pairId)!
    return { pairId: c.pairId, score: c.score, supplierA: { id: full.supplierA.id, name: full.supplierA.canonicalName }, supplierB: { id: full.supplierB.id, name: full.supplierB.canonicalName } }
  })
}

/** Record a reviewer's label. Idempotent per (workspace, pairId). */
export async function recordSupplierLabel(input: { workspaceId: string; pairId: string; sameSupplier: boolean; score: number; labelledById: string | null }): Promise<void> {
  await prisma.supplierMatchLabel.upsert({
    where: { workspaceId_pairId: { workspaceId: input.workspaceId, pairId: input.pairId } },
    create: { workspaceId: input.workspaceId, pairId: input.pairId, sameSupplier: input.sameSupplier, score: input.score, labelledById: input.labelledById },
    update: { sameSupplier: input.sameSupplier, score: input.score, labelledById: input.labelledById, updatedAt: new Date() },
  })
}

/** Compute (and persist as a workspace-level config hint) the optimal thresholds for the
 * workspace's current label set. Returns the verdict for the caller to render or apply. */
export async function proposeSupplierThresholds(workspaceId: string): Promise<ReturnType<typeof optimalThresholds>> {
  const labels: PairLabel[] = (await prisma.supplierMatchLabel.findMany({
    where: { workspaceId },
    select: { pairId: true, sameSupplier: true, score: true },
  }))
  return optimalThresholds(labels)
}

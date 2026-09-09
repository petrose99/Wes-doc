// Deliberately NOT a "use server" module: trusts the workspaceId it is handed.
import { prisma } from "@/lib/db"

export type MatchingSummary = {
  total: number
  byStatus: Record<string, number>
  byType: Record<string, number>
  confidenceBuckets: { label: string; range: string; count: number }[]
  bankTotal: number
  bankAccepted: number
  bankReconciled: number
}

/** Rollup of DocumentMatch (2/3-way PO ↔ invoice ↔ receipt) + BankMatch (statement ↔ invoice)
 * activity, for the Matching tab. */
export async function summarizeMatching(workspaceId: string): Promise<MatchingSummary> {
  const [docMatches, bankAgg] = await Promise.all([
    prisma.documentMatch.findMany({
      where: { workspaceId },
      select: { matchType: true, status: true, confidence: true },
    }),
    prisma.bankMatch.findMany({
      where: { workspaceId },
      select: { status: true, matchedDocument: { select: { paymentStatus: true } } },
    }),
  ])

  const byStatus: Record<string, number> = {}
  const byType: Record<string, number> = {}
  const buckets = [
    { label: "0–50%", range: "0-0.5", min: 0, max: 0.5, count: 0 },
    { label: "50–70%", range: "0.5-0.7", min: 0.5, max: 0.7, count: 0 },
    { label: "70–85%", range: "0.7-0.85", min: 0.7, max: 0.85, count: 0 },
    { label: "85–95%", range: "0.85-0.95", min: 0.85, max: 0.95, count: 0 },
    { label: "95–100%", range: "0.95-1.0", min: 0.95, max: 1.01, count: 0 },
  ]

  for (const m of docMatches) {
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1
    byType[m.matchType] = (byType[m.matchType] ?? 0) + 1
    for (const b of buckets) {
      if (m.confidence >= b.min && m.confidence < b.max) { b.count++; break }
    }
  }

  const bankTotal = bankAgg.length
  const bankAccepted = bankAgg.filter((m) => m.status === "accepted").length
  const bankReconciled = bankAgg.filter((m) => m.status === "accepted" && m.matchedDocument.paymentStatus === "paid").length

  return {
    total: docMatches.length,
    byStatus,
    byType,
    confidenceBuckets: buckets.map(({ label, range, count }) => ({ label, range, count })),
    bankTotal, bankAccepted, bankReconciled,
  }
}

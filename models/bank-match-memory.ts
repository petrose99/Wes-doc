// Deliberately NOT a "use server" module — trusts the workspaceId it is handed. Called from
// models/bank-matches.ts (learn on accept) and lib/bank-match/matcher.ts's caller (bias on scan).
import { normalizeBankDescriptor } from "@/lib/bank-match/counterparty"
import { prisma } from "@/lib/db"

/** A3.7: after a reviewer accepts a bank line -> document match, remember the descriptor
 * residue -> supplier hint for the next similar line. Fire-and-forget; a missed write is a
 * lost learning signal, not a broken action. */
export async function recordBankMatchAcceptance(input: {
  workspaceId: string
  descriptor: string
  supplierId: string | null
  codingHint?: unknown
}): Promise<void> {
  const key = normalizeBankDescriptor(input.descriptor)
  if (!key || key.length < 3) return
  try {
    await prisma.bankMatchMemory.upsert({
      where: { workspaceId_descriptorKey: { workspaceId: input.workspaceId, descriptorKey: key } },
      create: {
        workspaceId: input.workspaceId, descriptorKey: key,
        supplierId: input.supplierId, codingHint: (input.codingHint ?? null) as never,
        hitCount: 1, lastUsedAt: new Date(),
      },
      update: {
        supplierId: input.supplierId, codingHint: (input.codingHint ?? null) as never,
        hitCount: { increment: 1 }, lastUsedAt: new Date(),
      },
    })
  } catch (error) {
    console.error("[bank-match-memory] failed to record acceptance:", error instanceof Error ? error.message : error)
  }
}

/** Look up a descriptor's remembered supplier hint. Returns null when nothing matches. */
export async function lookupBankMatchMemory(workspaceId: string, descriptor: string): Promise<{ supplierId: string | null; codingHint: unknown; hitCount: number } | null> {
  const key = normalizeBankDescriptor(descriptor)
  if (!key || key.length < 3) return null
  try {
    const row = await prisma.bankMatchMemory.findUnique({
      where: { workspaceId_descriptorKey: { workspaceId, descriptorKey: key } },
      select: { supplierId: true, codingHint: true, hitCount: true },
    })
    return row ?? null
  } catch (error) {
    console.error("[bank-match-memory] lookup failed:", error instanceof Error ? error.message : error)
    return null
  }
}

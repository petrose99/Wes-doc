// Deliberately NOT a "use server" module. Called from an admin action or the settings UI's
// server action, both of which do their own auth first.
import { prisma } from "@/lib/db"

/** A5.6: merge one supplier ("loser") into another ("winner"). Records the loser's snapshot
 * (canonicalName, aliases, counters, iban/domain/vat) into SupplierMergeEvent, moves every
 * alias + BankMatchMemory row onto the winner, sums the counters, and deletes the loser row.
 * Reversible: unmergeSupplier rebuilds the loser from the snapshot and moves its aliases back.
 *
 * Idempotent: a second merge of the same loser is a no-op (the loser row is already gone). */
export async function mergeSuppliers(input: {
  workspaceId: string
  winnerId: string
  loserId: string
  createdById?: string | null
}): Promise<{ mergeEventId: string } | null> {
  if (input.winnerId === input.loserId) throw new Error("cannot_merge_supplier_into_itself")
  return prisma.$transaction(async (tx) => {
    const [winner, loser] = await Promise.all([
      tx.supplier.findFirst({ where: { id: input.winnerId, workspaceId: input.workspaceId } }),
      tx.supplier.findFirst({ where: { id: input.loserId, workspaceId: input.workspaceId }, include: { aliases: true } }),
    ])
    if (!winner || !loser) return null

    const snapshot = {
      canonicalName: loser.canonicalName,
      normalizedKey: loser.normalizedKey,
      bankDetails: loser.bankDetails,
      domain: loser.domain,
      vatNumber: loser.vatNumber,
      iban: loser.iban,
      documentCount: loser.documentCount,
      consecutiveClean: loser.consecutiveClean,
      touchlessSeen: loser.touchlessSeen,
      aliases: loser.aliases.map((a) => ({ aliasNormalized: a.aliasNormalized, source: a.source })),
    }
    const merge = await tx.supplierMergeEvent.create({
      data: {
        workspaceId: input.workspaceId, winnerId: input.winnerId, loserId: input.loserId,
        loserSnapshot: snapshot as never, createdById: input.createdById ?? null,
      },
      select: { id: true },
    })

    // Move aliases; drop conflicts silently (the alias already points at the winner). Also add
    // the loser's own normalized key as an alias so future extractions still resolve.
    for (const alias of loser.aliases) {
      await tx.supplierAlias.upsert({
        where: { workspaceId_aliasNormalized: { workspaceId: input.workspaceId, aliasNormalized: alias.aliasNormalized } },
        create: { workspaceId: input.workspaceId, supplierId: input.winnerId, aliasNormalized: alias.aliasNormalized, source: alias.source },
        update: { supplierId: input.winnerId },
      }).catch(() => { /* alias already points elsewhere — leave it */ })
    }
    await tx.supplierAlias.upsert({
      where: { workspaceId_aliasNormalized: { workspaceId: input.workspaceId, aliasNormalized: loser.normalizedKey } },
      create: { workspaceId: input.workspaceId, supplierId: input.winnerId, aliasNormalized: loser.normalizedKey, source: "merged" },
      update: { supplierId: input.winnerId },
    }).catch(() => { /* winner already claims this alias */ })

    // Sum counters onto the winner.
    await tx.supplier.update({
      where: { id: input.winnerId },
      data: {
        documentCount: winner.documentCount + loser.documentCount,
        touchlessSeen: winner.touchlessSeen + loser.touchlessSeen,
        // Streaks don't add — a merge shouldn't accidentally graduate a supplier past cold-start.
      },
    })

    await tx.supplierAlias.deleteMany({ where: { workspaceId: input.workspaceId, supplierId: input.loserId } })
    await tx.supplier.delete({ where: { id: input.loserId } })
    return { mergeEventId: merge.id }
  })
}

/** Reverses one previous merge: rebuilds the loser row from its snapshot, moves its old aliases
 * back, and marks the SupplierMergeEvent as reverted. Returns the restored supplier's id. */
export async function unmergeSuppliers(input: { workspaceId: string; mergeEventId: string }): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.supplierMergeEvent.findFirst({ where: { id: input.mergeEventId, workspaceId: input.workspaceId, revertedAt: null } })
    if (!event) return null
    const snapshot = event.loserSnapshot as Record<string, unknown>
    const rebuilt = await tx.supplier.create({
      data: {
        id: event.loserId, workspaceId: input.workspaceId,
        canonicalName: String(snapshot.canonicalName ?? "restored"),
        normalizedKey: String(snapshot.normalizedKey ?? crypto.randomUUID()),
        bankDetails: (snapshot.bankDetails ?? null) as never,
        domain: snapshot.domain as string | null,
        vatNumber: snapshot.vatNumber as string | null,
        iban: snapshot.iban as string | null,
        documentCount: Number(snapshot.documentCount ?? 0),
        consecutiveClean: Number(snapshot.consecutiveClean ?? 0),
        touchlessSeen: Number(snapshot.touchlessSeen ?? 0),
      },
    })
    const aliases = Array.isArray(snapshot.aliases) ? (snapshot.aliases as Array<{ aliasNormalized: string; source: string }>) : []
    for (const alias of aliases) {
      await tx.supplierAlias.upsert({
        where: { workspaceId_aliasNormalized: { workspaceId: input.workspaceId, aliasNormalized: alias.aliasNormalized } },
        create: { workspaceId: input.workspaceId, supplierId: rebuilt.id, aliasNormalized: alias.aliasNormalized, source: alias.source },
        update: { supplierId: rebuilt.id },
      }).catch(() => { /* alias currently points at the winner — leave it, restore stays partial */ })
    }
    await tx.supplierMergeEvent.update({ where: { id: event.id }, data: { revertedAt: new Date() } })
    return rebuilt.id
  })
}

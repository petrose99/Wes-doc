/** A5.2/A5.3: supplier resolution — raw extracted vendor text → one canonical Supplier row.
 * Lookup order is exact normalized key → known alias → token-set fuzzy against every supplier in
 * the workspace (≥0.92 auto-match, 0.80–0.92 "probably, show a person"). The observation writer
 * (recordSupplierObservation) is what the worker calls post-extraction: it resolves, learns the
 * raw spelling as an alias when it differs, keeps the rolling stats current, and uses a shared
 * IBAN as the dedup anchor — the same IBAN is the same real-world payee whatever the name says. */
import { prisma } from "@/lib/db"
import {
  normalizeIban,
  normalizeSupplierName,
  SUPPLIER_MATCH_AUTO_THRESHOLD,
  SUPPLIER_MATCH_REVIEW_THRESHOLD,
  tokenSetRatio,
} from "@/lib/suppliers/normalize"

export type SupplierMatchKind = "exact" | "alias" | "iban" | "fuzzy_auto" | "fuzzy_review" | "none"

export type SupplierResolution = {
  supplierId: string | null
  canonicalName: string | null
  matchKind: SupplierMatchKind
  /** tokenSetRatio for fuzzy kinds, 1 for exact/alias/iban, 0 for none. */
  score: number
}

/** Read-only resolution — no writes, safe anywhere. Fuzzy scan is capped: a workspace with more
 * suppliers than the cap resolves by exact/alias only, which is the correct degradation (fuzzy
 * over a huge set is where false merges live anyway). */
export async function resolveSupplier(workspaceId: string, rawName: string | null | undefined): Promise<SupplierResolution> {
  const key = normalizeSupplierName(rawName)
  if (!key) return { supplierId: null, canonicalName: null, matchKind: "none", score: 0 }

  const exact = await prisma.supplier.findUnique({
    where: { workspaceId_normalizedKey: { workspaceId, normalizedKey: key } },
    select: { id: true, canonicalName: true },
  })
  if (exact) return { supplierId: exact.id, canonicalName: exact.canonicalName, matchKind: "exact", score: 1 }

  const alias = await prisma.supplierAlias.findUnique({
    where: { workspaceId_aliasNormalized: { workspaceId, aliasNormalized: key } },
    select: { supplier: { select: { id: true, canonicalName: true } } },
  })
  if (alias) return { supplierId: alias.supplier.id, canonicalName: alias.supplier.canonicalName, matchKind: "alias", score: 1 }

  const candidates = await prisma.supplier.findMany({
    where: { workspaceId },
    select: { id: true, canonicalName: true, normalizedKey: true },
    take: 2000,
  })
  let best: { id: string; canonicalName: string; score: number } | null = null
  for (const candidate of candidates) {
    const score = Math.max(tokenSetRatio(key, candidate.normalizedKey), tokenSetRatio(key, candidate.canonicalName))
    if (score >= SUPPLIER_MATCH_REVIEW_THRESHOLD && (!best || score > best.score)) {
      best = { id: candidate.id, canonicalName: candidate.canonicalName, score }
    }
  }
  if (!best) return { supplierId: null, canonicalName: null, matchKind: "none", score: 0 }
  return {
    supplierId: best.id,
    canonicalName: best.canonicalName,
    matchKind: best.score >= SUPPLIER_MATCH_AUTO_THRESHOLD ? "fuzzy_auto" : "fuzzy_review",
    score: best.score,
  }
}

export type SupplierObservation = {
  workspaceId: string
  /** The raw extracted vendor/merchant/payee text, verbatim. */
  rawName: string
  iban?: string | null
  domain?: string | null
  vatNumber?: string | null
  observedAt?: Date
}

export type SupplierObservationResult = SupplierResolution & {
  /** True when this observation resolved to an existing supplier through its IBAN while the
   * names disagreed outright — the input the A2.2 bank-detail checks will treat as suspicious. */
  ibanNameConflict: boolean
}

/** Resolve-and-learn, called from the worker per extracted document. A "fuzzy_review" score
 * deliberately does NOT merge — it creates a separate supplier (a false split is reviewable and
 * reversible; a false merge silently pools two vendors' history), and the resolution is returned
 * so the caller can surface it. Never throws — post-extraction side effects must not kill the
 * pipeline (same contract as runDeterministicChecks). */
export async function recordSupplierObservation(input: SupplierObservation): Promise<SupplierObservationResult | null> {
  try {
    const key = normalizeSupplierName(input.rawName)
    if (!key) return null
    const observedAt = input.observedAt ?? new Date()
    const iban = normalizeIban(input.iban)

    let resolution = await resolveSupplier(input.workspaceId, input.rawName)
    let ibanNameConflict = false

    // IBAN anchor: an unresolved (or review-band) name whose IBAN we already know belongs to an
    // existing supplier attaches there instead of forking a new record.
    if (iban && (resolution.matchKind === "none" || resolution.matchKind === "fuzzy_review")) {
      const byIban = await prisma.supplier.findFirst({
        where: { workspaceId: input.workspaceId, iban },
        select: { id: true, canonicalName: true, normalizedKey: true },
      })
      if (byIban) {
        ibanNameConflict = tokenSetRatio(key, byIban.normalizedKey) < SUPPLIER_MATCH_REVIEW_THRESHOLD
        resolution = { supplierId: byIban.id, canonicalName: byIban.canonicalName, matchKind: "iban", score: 1 }
      }
    }

    const attachToExisting = resolution.supplierId !== null && resolution.matchKind !== "fuzzy_review"
    if (attachToExisting) {
      await prisma.supplier.update({
        where: { id: resolution.supplierId! },
        data: {
          documentCount: { increment: 1 },
          lastSeenAt: observedAt,
          ...(iban ? { iban } : {}),
          ...(input.domain ? { domain: input.domain } : {}),
          ...(input.vatNumber ? { vatNumber: input.vatNumber } : {}),
        },
      })
      // Learn this raw spelling so the next lookup is a single equality, not a fuzzy scan.
      if (resolution.matchKind !== "exact") {
        await prisma.supplierAlias.upsert({
          where: { workspaceId_aliasNormalized: { workspaceId: input.workspaceId, aliasNormalized: key } },
          create: { workspaceId: input.workspaceId, supplierId: resolution.supplierId!, aliasNormalized: key, source: "mined" },
          update: {},
        })
      }
      return { ...resolution, ibanNameConflict }
    }

    const created = await prisma.supplier.upsert({
      where: { workspaceId_normalizedKey: { workspaceId: input.workspaceId, normalizedKey: key } },
      create: {
        workspaceId: input.workspaceId,
        canonicalName: input.rawName.trim(),
        normalizedKey: key,
        iban: iban || null,
        domain: input.domain ?? null,
        vatNumber: input.vatNumber ?? null,
        documentCount: 1,
        lastSeenAt: observedAt,
      },
      update: { documentCount: { increment: 1 }, lastSeenAt: observedAt },
    })
    return {
      supplierId: created.id,
      canonicalName: created.canonicalName,
      // Preserve the review-band signal even though we forked a new record for it.
      matchKind: resolution.matchKind === "fuzzy_review" ? "fuzzy_review" : "none",
      score: resolution.matchKind === "fuzzy_review" ? resolution.score : 0,
      ibanNameConflict,
    }
  } catch (error) {
    console.error("[suppliers] failed to record observation:", error instanceof Error ? error.message : error)
    return null
  }
}

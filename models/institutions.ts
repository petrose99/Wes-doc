// Deliberately NOT a "use server" module, matching every other models/*.ts helper in this
// package: this trusts the workspaceId/documentId it is handed. Server Actions in
// app/(app)/workspaces/[workspaceId]/actions.ts are the auth boundary that calls into here.
import { DOC_TYPE_SPECS } from "@/lib/doc-types"
import { deriveStatementLayout, type StatementLayout } from "@/lib/checks/statement-layout-drift"
import { prisma } from "@/lib/db"
import type { Prisma } from "@/prisma/client"

/** #217: normalizes an institution's display name into the key `[workspaceId, normalizedKey]`
 * uniqueness is built on — lowercase, trimmed, internal whitespace collapsed to one space.
 * Deliberately simple: no punctuation stripping, no "Bank"/"Ltd" suffix folding, no fuzzy
 * matching. The assert flow is a person picking or naming an institution (#178's "assertion is
 * authoritative" rule, no AI classification) — "Standard Bank" and "Standard  Bank " collapse to
 * the same row, but "Standard Bank" and "Standard Bank Ltd" intentionally stay distinct until a
 * person merges them, which this ticket does not build. */
export function normalizeInstitutionKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

export async function listWorkspaceInstitutions(workspaceId: string) {
  return prisma.institution.findMany({ where: { workspaceId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
}

/** Finds-or-creates an Institution for this workspace by name. This is the sole writer of new
 * Institution rows, so the `[workspaceId, normalizedKey]` uniqueness constraint is enforced by a
 * lookup-then-create rather than relying on the caller to have checked first — a second assert
 * of the same institution name (by another reviewer, or a retry) resolves to the same row instead
 * of racing the unique constraint into a thrown error. */
export async function resolveOrCreateInstitution(workspaceId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Institution name is required")
  const normalizedKey = normalizeInstitutionKey(trimmed)
  const existing = await prisma.institution.findUnique({ where: { workspaceId_normalizedKey: { workspaceId, normalizedKey } } })
  if (existing) return existing
  try {
    return await prisma.institution.create({ data: { workspaceId, name: trimmed, normalizedKey } })
  } catch {
    // Lost a create race against another concurrent assert for the same normalizedKey — the row
    // exists now, so read it back instead of surfacing the unique-constraint error.
    const created = await prisma.institution.findUnique({ where: { workspaceId_normalizedKey: { workspaceId, normalizedKey } } })
    if (!created) throw new Error("Could not create institution")
    return created
  }
}

/** #217: "Accept as new layout" — a reviewer confirms a drifted statement's shape is the
 * institution's new normal. Overwrites `Institution.savedLayout` with this statement's derived
 * layout (the old layout is deliberately NOT preserved anywhere — this is the "teach it" action,
 * distinct from "Flag as anomaly" which leaves the saved layout untouched, see
 * escalateCheckAction in app/(app)/workspaces/[workspaceId]/actions.ts) and resolves the
 * `statement_layout_drift` DocumentCheckResult to `pass` so the banner clears. Reads
 * `reviewedData` only (not the rawExtraction fallback the detail page uses for display) to derive
 * the layout from exactly the values `runDeterministicChecks` judged the drift against. */
export async function acceptStatementLayoutAsNew(workspaceId: string, documentId: string): Promise<{ success: true; layout: StatementLayout } | { success: false; error: string }> {
  const document = await prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { id: true, institutionId: true, reviewedData: true } })
  if (!document) return { success: false, error: "Document not found" }
  if (!document.institutionId) return { success: false, error: "No institution asserted for this document" }

  const check = await prisma.documentCheckResult.findUnique({ where: { documentId_checkCode: { documentId, checkCode: "statement_layout_drift" } } })
  if (!check || check.workspaceId !== workspaceId) return { success: false, error: "No layout-drift check found for this document" }

  const transactionsKey = DOC_TYPE_SPECS.bank_statement.checkFields?.transactions
  const values = (document.reviewedData ?? {}) as Record<string, unknown>
  const rawTransactions = transactionsKey && Array.isArray(values[transactionsKey])
    ? (values[transactionsKey] as unknown[]).filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    : []
  const layout = deriveStatementLayout(rawTransactions)

  await prisma.$transaction([
    prisma.institution.update({ where: { id: document.institutionId }, data: { savedLayout: layout as unknown as Prisma.InputJsonValue } }),
    prisma.documentCheckResult.update({
      where: { id: check.id },
      data: { status: "pass", message: "Layout accepted as the new saved layout for this institution.", detail: { layout } as unknown as Prisma.InputJsonValue },
    }),
  ])

  return { success: true, layout }
}

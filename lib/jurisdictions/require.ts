/** AP-inbound guard (#49): every path a bill can enter through — email-in, upload actions,
 * public v1 API — asks this helper first. A workspace with no `jurisdictionCode` set refuses
 * inbound with a typed error rather than silently accepting a bill it has no pack to check
 * against. Overview surfaces the same state as a hard-gate-style banner. */
import { prisma } from "@/lib/db"

/** Thrown when a workspace hasn't picked a jurisdiction yet. Callers should catch this
 * specifically so they can render the "pick a jurisdiction" state — a bare Error message is
 * harder for the UI to route on. */
export class JurisdictionRequiredError extends Error {
  readonly code = "JURISDICTION_REQUIRED"
  constructor(readonly workspaceId: string) {
    super("This workspace needs to pick a jurisdiction before AP inbound can accept bills.")
    this.name = "JurisdictionRequiredError"
  }
}

/** Ensure the workspace has a jurisdiction set. Throws JurisdictionRequiredError otherwise.
 * Returns the resolved code + packVersion so callers can stamp them without a second query. */
export async function requireWorkspaceJurisdiction(workspaceId: string): Promise<{ jurisdictionCode: string; jurisdictionPackVersion: string | null }> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { jurisdictionCode: true, jurisdictionPackVersion: true },
  })
  if (!workspace?.jurisdictionCode) throw new JurisdictionRequiredError(workspaceId)
  return {
    jurisdictionCode: workspace.jurisdictionCode,
    jurisdictionPackVersion: workspace.jurisdictionPackVersion,
  }
}

/** Non-throwing variant for surfaces that render a state rather than error out (Overview banner,
 * settings page, etc.). */
export async function getWorkspaceJurisdiction(workspaceId: string): Promise<{ jurisdictionCode: string | null; jurisdictionPackVersion: string | null }> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { jurisdictionCode: true, jurisdictionPackVersion: true },
  })
  return {
    jurisdictionCode: workspace?.jurisdictionCode ?? null,
    jurisdictionPackVersion: workspace?.jurisdictionPackVersion ?? null,
  }
}

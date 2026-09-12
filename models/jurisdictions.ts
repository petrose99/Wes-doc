// Deliberately NOT a "use server" module, matching models/tax-profiles.ts and models/workspaces.ts:
// this trusts the workspaceId it is handed. The server action doing the auth lives in
// app/(app)/workspaces/[workspaceId]/jurisdiction-actions.ts.
import { prisma } from "@/lib/db"
import { resolveJurisdictionPack, type JurisdictionCode } from "@/lib/jurisdictions"
import { setTaxRegion } from "@/models/tax-profiles"
import type { TaxRegionCode } from "@/lib/tax/types"

/** Maps a jurisdiction code to the corresponding tax-region code (which is what
 * models/tax-profiles.ts still keys on for its rate snapshot). Kept here rather than in
 * lib/jurisdictions because the mapping is a bridge between the pack layer (#39, code-live) and
 * the older rate-snapshot layer (retroactive per #39) — the two vocabularies coexist during the
 * transition, and this is the one place that knows both. */
const JURISDICTION_TO_TAX_REGION: Record<JurisdictionCode, TaxRegionCode> = {
  ZA: "za",
  LS: "ls",
  GB: "gb",
  "US-CA": "us",
}

/** Stamp the workspace's jurisdictionCode + jurisdictionPackVersion from the pack, and snapshot
 * the corresponding tax-region rate config as a new TaxProfileVersion (existing behavior — see
 * #39: rates keep their retroactive snapshot). Callers must have verified the user's role and
 * capability first — this trusts the workspaceId. */
export async function setWorkspaceJurisdiction(workspaceId: string, code: JurisdictionCode): Promise<void> {
  const pack = resolveJurisdictionPack(code)
  if (!pack) throw new Error(`No jurisdiction pack registered for code: ${code}`)

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { jurisdictionCode: code, jurisdictionPackVersion: pack.packVersion },
  })

  // Preserve the retroactive rate-snapshot behavior (#39). If the mapping ever gains a
  // jurisdiction without a matching tax-region (e.g. a state-specific US pack that outgrows the
  // single "us" tax region), skip the snapshot rather than pretending it happened.
  const taxRegion = JURISDICTION_TO_TAX_REGION[code]
  if (taxRegion) await setTaxRegion(workspaceId, taxRegion)
}

export async function getWorkspaceJurisdictionSummary(workspaceId: string): Promise<{ code: JurisdictionCode; packVersion: string | null } | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { jurisdictionCode: true, jurisdictionPackVersion: true },
  })
  if (!workspace?.jurisdictionCode) return null
  return { code: workspace.jurisdictionCode as JurisdictionCode, packVersion: workspace.jurisdictionPackVersion }
}

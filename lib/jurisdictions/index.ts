/** Jurisdiction pack registry (#49). Enumerates the intended codes at ship time and lazily
 * resolves each code's pack file from `lib/jurisdictions/<code>/index.ts`; a code with no pack
 * file resolves to `null`, so the picker only shows codes it can actually stamp a packVersion
 * from. Decision #39 fixes this layout — do not fold packs into `lib/tax/regions/`.
 *
 * Adding a code: create `<code>/index.ts` exporting a `JurisdictionPack` default, then register
 * the loader in `PACK_LOADERS` below. A code listed in `JURISDICTION_CODES` but not in
 * `PACK_LOADERS` is a "coming soon" — the picker hides it until the pack ships. */
import type { JurisdictionCode, JurisdictionPack } from "./types"
import zaPack from "./za"
import lsPack from "./ls"

/** Intended pack codes at ship time (ZA / LS / GB / US-CA per #49). A code being listed here is
 * a promise the pack is planned — not that it exists yet. `listAvailableJurisdictions` filters
 * out codes with no loader. */
export const JURISDICTION_CODES: readonly JurisdictionCode[] = ["ZA", "LS", "GB", "US-CA"] as const

/** Human-readable label for the picker. Kept next to the codes rather than in a translation file
 * because the codes themselves ARE the API surface — a workspace's jurisdictionCode column stores
 * one of these strings, so both live and evolve together. */
export const JURISDICTION_NAMES: Record<JurisdictionCode, string> = {
  ZA: "South Africa",
  LS: "Lesotho",
  GB: "United Kingdom",
  "US-CA": "United States — California",
}

/** Static registry of code → pack. Only codes whose pack file exists get an entry — a missing
 * entry means "not yet shipped", and the picker hides that code until its ticket lands. When
 * adding a new pack: import it at the top and add the entry here. */
const PACK_LOADERS: Partial<Record<JurisdictionCode, JurisdictionPack>> = {
  ZA: zaPack,
  LS: lsPack,
}

/** Fetch a pack by code, or null if the code isn't known or its pack file isn't present. */
export function resolveJurisdictionPack(code: string | null | undefined): JurisdictionPack | null {
  if (!code) return null
  if (!(JURISDICTION_CODES as readonly string[]).includes(code)) return null
  return PACK_LOADERS[code as JurisdictionCode] ?? null
}

export type AvailableJurisdiction = { code: JurisdictionCode; name: string; packVersion: string }

/** Enumerate the codes whose pack is registered — the picker uses this so it only ever offers
 * codes it can actually stamp a packVersion from. Preserves the order in `JURISDICTION_CODES`. */
export function listAvailableJurisdictions(): AvailableJurisdiction[] {
  return JURISDICTION_CODES
    .map((code) => {
      const pack = PACK_LOADERS[code]
      if (!pack) return null
      return { code, name: JURISDICTION_NAMES[code], packVersion: pack.packVersion }
    })
    .filter((r): r is AvailableJurisdiction => r !== null)
}

export type { JurisdictionCode, JurisdictionPack } from "./types"

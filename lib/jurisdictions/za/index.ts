/** ZA jurisdiction pack — minimal stub for #49's picker. The actual rule content (s20 invoice
 * checks, VAT201 input-tax split, 5-year retention, R1m/R2.3m thresholds, SARS-RSL border
 * arrangement) lands in ticket #50; this file only exists so the registry has something to
 * import and so a workspace can pick ZA and stamp a packVersion today. */
import type { JurisdictionPack } from "../types"

export const zaPack: JurisdictionPack = {
  code: "ZA",
  packVersion: "za-v0-2026-09",
}

export default zaPack

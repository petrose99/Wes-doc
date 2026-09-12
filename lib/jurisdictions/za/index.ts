/** ZA jurisdiction pack — full content shipped by ticket #50 (map #35). The picker consumed the
 * prior stub via `packVersion`; that field is now bumped to `za-v1-2026-09` so every rule fired
 * from this pack stamps a version distinct from the stub.
 *
 * Structure follows decision #39: one file per topic (invoice-validity / input-tax / filings /
 * retention / thresholds / border), re-exported here so consumers can `import pack from
 * "@/lib/jurisdictions/za"` and reach every rule row. */
import type { JurisdictionPack } from "../types"
import { zaInvoiceValidity } from "./invoice-validity"
import { zaInputTax } from "./input-tax"
import { zaFilings } from "./filings"
import { zaRetention } from "./retention"
import { zaThresholds } from "./thresholds"
import { zaBorder } from "./border"
import { zaWorkpapers } from "./workpapers"

export const zaPack: JurisdictionPack = {
  code: "ZA",
  packVersion: "za-v1-2026-09",
  invoiceValidity: zaInvoiceValidity,
  inputTax: zaInputTax,
  filings: zaFilings,
  retention: zaRetention,
  thresholds: {
    compulsoryRegistration: zaThresholds.compulsoryRegistration,
    voluntaryRegistration: zaThresholds.voluntaryRegistration,
  },
  border: zaBorder,
  workpapers: zaWorkpapers,
}

export default zaPack

export { zaInvoiceValidity, zaInputTax, zaFilings, zaRetention, zaThresholds, zaBorder, zaWorkpapers }

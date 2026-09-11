/** LS jurisdiction pack — full content shipped by ticket #74 (map #35), parallel to ZA's #50.
 * Assembles the six topic files + the LS VAT-12 workpaper from #70 (whose `box` codes are
 * back-filled in this PR now that filings.ts / input-tax.ts declare them). */
import type { JurisdictionPack } from "../types"
import { lsInvoiceValidity } from "./invoice-validity"
import { lsInputTax } from "./input-tax"
import { lsFilings } from "./filings"
import { lsRetention } from "./retention"
import { lsThresholds } from "./thresholds"
import { lsBorder } from "./border"
import { lsWorkpapers } from "./workpapers"

export const lsPack: JurisdictionPack = {
  code: "LS",
  packVersion: "ls-v1-2026-09",
  invoiceValidity: lsInvoiceValidity,
  inputTax: lsInputTax,
  filings: lsFilings,
  retention: lsRetention,
  thresholds: {
    compulsoryRegistration: lsThresholds.compulsoryRegistration,
    voluntaryRegistration: lsThresholds.voluntaryRegistration,
  },
  border: lsBorder,
  workpapers: lsWorkpapers,
}

export default lsPack

export {
  lsInvoiceValidity,
  lsInputTax,
  lsFilings,
  lsRetention,
  lsThresholds,
  lsBorder,
  lsWorkpapers,
}

/** Wayfinder decision #39 fixed the pack shape: one directory per jurisdiction under
 * `lib/jurisdictions/<code>/`, one file per topic (invoice-validity / input-tax / filings /
 * retention / thresholds / border), all re-exported from that directory's `index.ts` alongside a
 * stable `packVersion` string. Ticket #49 ships the picker + a ZA stub; #50 lands the real ZA
 * pack content; the other jurisdictions arrive on their own tickets.
 *
 * The registry (see `./index.ts`) enumerates the intended codes but treats each pack file as
 * optional — a code with no pack file is not offered by the picker, so a ZA-only ship is valid
 * (matches the ticket's "registry ignores missing pack directories rather than crashing" DoD).
 *
 * The pack shape below is intentionally minimal at this point: the picker only needs `code` and
 * `packVersion`. The rule-row shapes (invoiceValidity, inputTax, filings, retention, thresholds,
 * border) belong to ticket #50 and its siblings, and will be added as those tickets ship. */
export type JurisdictionCode = "ZA" | "LS" | "GB" | "US-CA"

export type JurisdictionPack = {
  code: JurisdictionCode
  /** Stamped on workspace settings when the pack is picked and on every DocumentCheckResult when
   * a rule from this pack runs. Bump when the rule surface changes materially. */
  packVersion: string
}

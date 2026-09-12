/** ZA VAT201 workpaper — one row per bill, eight primary columns across the isImport × isCapital
 * grid (net + vat per bucket), plus a top-level `boxes['18']` combiner for total claimable input
 * tax. Consumed by the close checklist's VAT return prep item (#42, #47).
 *
 * Authoritative box mapping is the one already declared in `input-tax.ts` and
 * `zaVat201FieldFor` — that mapping was written straight from SARS's VAT201 completion guide in
 * #36, and it is the reverse of the draft in #47's resolution comment (14/14A/15/15A follow the
 * form's own labelling: unsuffixed = supplied-to-you locally, A-suffixed = imported-by-you). This
 * file defers to the pack, not to the draft.
 *
 * #47's shape decisions applied here:
 *   - Column `select` is a plain TS function (Q1).
 *   - `net` columns carry no box; `vat` columns carry the 1:1 box (Q4).
 *   - Zero-rated inputs contribute `net=amount, vat=0` — the vat column returns 0 (a real
 *     contribution), not null (Q9).
 *   - `boxes['18']` sums the four vat columns via a top-level combiner (Q4). */
import type { Workpaper } from "../_shared/workpaper"

const SARS_VAT201 = "https://www.sars.gov.za/guide-to-completing-the-value-added-tax-vat201-return/"

/** True when this bill belongs to the (isImport, isCapital) bucket. Used by each column's select
 * to decide whether to contribute or return null. */
const inBucket = (imported: boolean, capital: boolean) =>
  (bill: { isImport: boolean; isCapital: boolean }) =>
    bill.isImport === imported && bill.isCapital === capital

export const zaVat201: Workpaper = {
  id: "ZA_VAT201",
  label: "VAT201 — Input tax workpaper",
  sourceRef: SARS_VAT201,
  cadence: "bimonthly",
  columns: [
    // Domestic × non-capital → VAT201 box 15
    {
      id: "input_domestic_other_net",
      label: "Domestic (non-capital) — net",
      sourceRef: SARS_VAT201,
      role: "primary",
      select: (bill) => (inBucket(false, false)(bill) ? bill.net : null),
    },
    {
      id: "input_domestic_other_vat",
      label: "Domestic (non-capital) — VAT",
      sourceRef: SARS_VAT201,
      role: "primary",
      box: "15",
      select: (bill) => (inBucket(false, false)(bill) ? bill.vat : null),
    },
    // Domestic × capital → VAT201 box 14
    {
      id: "input_domestic_capital_net",
      label: "Domestic capital — net",
      sourceRef: SARS_VAT201,
      role: "primary",
      select: (bill) => (inBucket(false, true)(bill) ? bill.net : null),
    },
    {
      id: "input_domestic_capital_vat",
      label: "Domestic capital — VAT",
      sourceRef: SARS_VAT201,
      role: "primary",
      box: "14",
      select: (bill) => (inBucket(false, true)(bill) ? bill.vat : null),
    },
    // Imported × non-capital → VAT201 box 15A
    {
      id: "input_imported_other_net",
      label: "Imported (non-capital) — net",
      sourceRef: SARS_VAT201,
      role: "primary",
      select: (bill) => (inBucket(true, false)(bill) ? bill.net : null),
    },
    {
      id: "input_imported_other_vat",
      label: "Imported (non-capital) — VAT",
      sourceRef: SARS_VAT201,
      role: "primary",
      box: "15A",
      select: (bill) => (inBucket(true, false)(bill) ? bill.vat : null),
    },
    // Imported × capital → VAT201 box 14A
    {
      id: "input_imported_capital_net",
      label: "Imported capital — net",
      sourceRef: SARS_VAT201,
      role: "primary",
      select: (bill) => (inBucket(true, true)(bill) ? bill.net : null),
    },
    {
      id: "input_imported_capital_vat",
      label: "Imported capital — VAT",
      sourceRef: SARS_VAT201,
      role: "primary",
      box: "14A",
      select: (bill) => (inBucket(true, true)(bill) ? bill.vat : null),
    },
  ],
  boxes: {
    // Total input tax (VAT201 Part B total). Authoritative over the 1:1 mapping on any of the
    // component VAT columns (none of them map to 18 directly, so no conflict).
    "18": (sums) =>
      sums.input_domestic_other_vat +
      sums.input_domestic_capital_vat +
      sums.input_imported_other_vat +
      sums.input_imported_capital_vat,
  },
  outputVatAsserted: true,
}

export const zaWorkpapers = [zaVat201] as const

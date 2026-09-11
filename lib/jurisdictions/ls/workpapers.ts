/** LS VAT-12 workpaper — 10 primary columns across isImport × taxRate∈{15,10,0} (net + vat per
 * non-zero bucket; net-only for zero rows since vat is 0 there), plus one crossCutting column
 * for the RSA cross-border input-VAT slice.
 *
 * Consumed by the close checklist's LS VAT return prep item (#42, #47).
 *
 * ## Box codes stay undefined — a workpaper-vs-VAT12 shape mismatch
 *
 * The LRA VAT-12 form splits inputs six ways: **goods vs services × deferred vs other**
 * (lines 7a/7b/8a/8b/8c/8d — see `filings.ts` and `input-tax.ts`). This workpaper buckets bills
 * by **isImport × taxRate ∈ {15, 10, 0}** (the shape decided in #47). Those two splits do NOT
 * commute — a "local 15%" column mixes 7a (goods) and 7b (services), a "import 15%" column mixes
 * all four of 8a/8b/8c/8d. Back-filling `box:` codes would require every bill's projection to
 * carry `isService` and `isDeferred` flags, and those flags need coding classification the app
 * doesn't currently produce.
 *
 * So every VAT column stays `box: undefined`. The workpaper remains valuable as a review sheet
 * plus the RSA cross-border slice; **return-form generation is a separate ticket** and will
 * either (a) extend `WorkpaperBill` with `isService`/`isDeferred` and re-bucket the columns, or
 * (b) ship a second, orthogonal workpaper shaped to the VAT-12 form.
 *
 * ## `isRsaCrossBorder` semantics (#47 Q13)
 *
 * A bill contributes to the RSA cross-border slice iff:
 *   - supplier country is ZA
 *   - supplier VAT number matches /^4\d{9}$/ (SARS's 10-digit vendor number starting `4`)
 *   - invoice date is ≤ 90 days before the period end date (measured against period.endDate)
 *
 * A future-dated invoice (endDate < invoiceDate) yields a negative diff, which still satisfies
 * `<= 90` — that's a rare data-quality edge, but the arithmetic is deliberate: extraction is
 * fallible, and we'd rather include a possibly-future invoice than silently drop it. */
import type { Period, Workpaper, WorkpaperBill } from "../_shared/workpaper"

const LRA_VAT12 = "https://www.rsl.org.ls/"

/** True when the bill's rate and import status match the given bucket. */
const inBucket = (imported: boolean, rate: number) =>
  (bill: WorkpaperBill) =>
    bill.isImport === imported && bill.taxRate === rate

/** RSA cross-border eligibility for the LS input-VAT recovery arrangement (#43). Pack-local per
 * #47 Q5 — one caller, no shared helper. */
export function isRsaCrossBorder(bill: WorkpaperBill, period: Period): boolean {
  if (bill.supplier.country !== "ZA") return false
  const vatNo = bill.supplier.vatNumber ?? ""
  if (!/^4\d{9}$/.test(vatNo)) return false
  const msPerDay = 1000 * 60 * 60 * 24
  const days = Math.floor(
    (period.endDate.getTime() - bill.invoiceDate.getTime()) / msPerDay,
  )
  return days <= 90
}

export const lsVat12: Workpaper = {
  id: "LS_VAT12",
  label: "VAT-12 — Input tax workpaper",
  sourceRef: LRA_VAT12,
  cadence: "monthly",
  columns: [
    // Local × 15
    {
      id: "input_local_15_net",
      label: "Local — standard rate (15%) — net",
      sourceRef: LRA_VAT12,
      role: "primary",
      select: (bill) => (inBucket(false, 15)(bill) ? bill.net : null),
    },
    {
      id: "input_local_15_vat",
      label: "Local — standard rate (15%) — VAT",
      sourceRef: LRA_VAT12,
      role: "primary",
      select: (bill) => (inBucket(false, 15)(bill) ? bill.vat : null),
    },
    // Local × 10 (electricity per #43)
    {
      id: "input_local_10_net",
      label: "Local — reduced rate (10%, electricity) — net",
      sourceRef: LRA_VAT12,
      role: "primary",
      select: (bill) => (inBucket(false, 10)(bill) ? bill.net : null),
    },
    {
      id: "input_local_10_vat",
      label: "Local — reduced rate (10%, electricity) — VAT",
      sourceRef: LRA_VAT12,
      role: "primary",
      select: (bill) => (inBucket(false, 10)(bill) ? bill.vat : null),
    },
    // Local × 0 (net-only)
    {
      id: "input_local_0_net",
      label: "Local — zero-rated — net",
      sourceRef: LRA_VAT12,
      role: "primary",
      select: (bill) => (inBucket(false, 0)(bill) ? bill.net : null),
    },
    // Import × 15
    {
      id: "input_import_15_net",
      label: "Import — standard rate (15%) — net",
      sourceRef: LRA_VAT12,
      role: "primary",
      select: (bill) => (inBucket(true, 15)(bill) ? bill.net : null),
    },
    {
      id: "input_import_15_vat",
      label: "Import — standard rate (15%) — VAT",
      sourceRef: LRA_VAT12,
      role: "primary",
      select: (bill) => (inBucket(true, 15)(bill) ? bill.vat : null),
    },
    // Import × 10
    {
      id: "input_import_10_net",
      label: "Import — reduced rate (10%) — net",
      sourceRef: LRA_VAT12,
      role: "primary",
      select: (bill) => (inBucket(true, 10)(bill) ? bill.net : null),
    },
    {
      id: "input_import_10_vat",
      label: "Import — reduced rate (10%) — VAT",
      sourceRef: LRA_VAT12,
      role: "primary",
      select: (bill) => (inBucket(true, 10)(bill) ? bill.vat : null),
    },
    // Import × 0 (net-only)
    {
      id: "input_import_0_net",
      label: "Import — zero-rated — net",
      sourceRef: LRA_VAT12,
      role: "primary",
      select: (bill) => (inBucket(true, 0)(bill) ? bill.net : null),
    },
    // Cross-cutting: RSA cross-border input VAT (#43 SARS-RSL common-border arrangement).
    // A slice of the import rows, not an additional filing bucket — the renderer shows it in a
    // divided band and the LS rule pack will map it to its LRA box when it lands.
    {
      id: "input_rsa_cross_border_vat",
      label: "RSA cross-border input VAT (SARS-RSL, ≤90 days)",
      sourceRef: LRA_VAT12,
      role: "crossCutting",
      select: (bill, period) => (isRsaCrossBorder(bill, period) ? bill.vat : null),
    },
  ],
  outputVatAsserted: true,
}

export const lsWorkpapers = [lsVat12] as const

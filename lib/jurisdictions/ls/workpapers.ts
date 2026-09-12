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
import { lsVat12FieldFor } from "./input-tax"

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

/** LS_VAT12_RETURN — the return-form audit view, orthogonal to `lsVat12`.
 *
 * Where `lsVat12` buckets by `isImport × taxRate ∈ {15, 10, 0}` for reconciliation, this
 * workpaper cuts by `isImport × isService × isDeferred` — the exact split the LRA VAT-12
 * return form uses (lines 7a/7b/8a/8b/8c/8d — see filings.ts and input-tax.ts). Every column
 * carries its LRA VAT-12 box code so the numbers on this sheet map 1:1 to the return.
 *
 * Bill selectivity per #82 / this ticket:
 *   - `isService === null` → silent-pass (the reconciliation workpaper still captures the bill).
 *   - Import buckets with `isDeferred === null` → silent-pass for the same reason.
 *   - Local buckets ignore `isDeferred` (the router doesn't consult it there).
 *   - Zero-rated bills still contribute: `net` normally, `vat = 0` (the vat column simply
 *     sums to zero for a pure zero-rated slice, matching the pattern on `lsVat12`).
 *
 * No `crossCutting` column — the RSA cross-border slice stays on `lsVat12` reconciliation only. */

/** Column spec for a single VAT-12 return line. */
type ReturnLine = {
  field: string
  label: string
  isImport: boolean
  isService: boolean
  isDeferred: boolean | null
}

const RETURN_LINES: readonly ReturnLine[] = [
  {
    field: "vat12.7a",
    label: "7a — Local purchases of goods",
    isImport: false,
    isService: false,
    isDeferred: null,
  },
  {
    field: "vat12.7b",
    label: "7b — Local purchases of services",
    isImport: false,
    isService: true,
    isDeferred: null,
  },
  {
    field: "vat12.8a",
    label: "8a — Imported goods (deferred / IVCF)",
    isImport: true,
    isService: false,
    isDeferred: true,
  },
  {
    field: "vat12.8b",
    label: "8b — Imported services (deferred / IVCF)",
    isImport: true,
    isService: true,
    isDeferred: true,
  },
  {
    field: "vat12.8c",
    label: "8c — Imported goods (other)",
    isImport: true,
    isService: false,
    isDeferred: false,
  },
  {
    field: "vat12.8d",
    label: "8d — Imported services (other)",
    isImport: true,
    isService: true,
    isDeferred: false,
  },
] as const

/** Does this bill route to the given return line? Silent-passes bills with the null flags the
 * router needs to make a decision. */
function billMatchesLine(bill: WorkpaperBill, line: ReturnLine): boolean {
  if (bill.isService === null) return false
  if (bill.isImport && bill.isDeferred === null) return false
  if (bill.isImport !== line.isImport) return false
  const routed = lsVat12FieldFor({
    isImport: bill.isImport,
    isService: bill.isService,
    isDeferred: bill.isDeferred ?? undefined,
  })
  return routed === line.field
}

export const lsVat12Return: Workpaper = {
  id: "LS_VAT12_RETURN",
  label: "VAT-12 — Return lines 7a–8d (goods/services × deferred split)",
  sourceRef: LRA_VAT12,
  cadence: "monthly",
  columns: RETURN_LINES.flatMap((line) => [
    {
      id: `${line.field.replace(".", "_")}_net`,
      label: `${line.label} — net`,
      sourceRef: LRA_VAT12,
      role: "primary" as const,
      box: `${line.field}.net`,
      select: (bill: WorkpaperBill) => (billMatchesLine(bill, line) ? bill.net : null),
    },
    {
      id: `${line.field.replace(".", "_")}_vat`,
      label: `${line.label} — VAT`,
      sourceRef: LRA_VAT12,
      role: "primary" as const,
      box: `${line.field}.vat`,
      select: (bill: WorkpaperBill) => (billMatchesLine(bill, line) ? bill.vat : null),
    },
  ]),
  outputVatAsserted: true,
}

/** Close-checklist grouping (#42). The two LS VAT-12 workpapers bundle under a single close
 * item — reconciliation on one tab, return-line audit on the other — with one sign-off covering
 * both. Consumed by the close checklist once it lands (no consumer today); ordered so the
 * reconciliation view appears first (it's the one accountants review before signing the return
 * numbers). */
export type WorkpaperGroup = {
  /** Stable close-checklist item id. */
  id: string
  /** Human-readable label the close item renders. */
  label: string
  /** Workpaper ids in tab order. Signing off the group signs off every workpaper here. */
  workpaperIds: readonly string[]
}

export const lsWorkpaperGroups: readonly WorkpaperGroup[] = [
  {
    id: "ls_vat12_workpaper",
    label: "LS VAT-12 workpaper",
    workpaperIds: ["LS_VAT12", "LS_VAT12_RETURN"],
  },
]

export const lsWorkpapers = [lsVat12, lsVat12Return] as const

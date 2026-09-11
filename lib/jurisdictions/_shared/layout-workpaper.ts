/** Presentation-neutral workpaper layout. The map (#42) commits to "one abstract template
 * driven by jurisdiction-pack column config": this file is that template's shape. It groups
 * columns by role (primary → divider → crossCutting), pairs each computed row with its
 * per-column value, appends the totals row, and surfaces the box summary with the columns
 * that fed each box (single-column via `column.box`, multi-column via `pack.boxes`).
 *
 * A Univer sheet, an HTML table, and a CSV export each read the same `WorkpaperLayout` — none
 * of them lives here, so the shared code stays testable without a DOM. */
import type { ComputedWorkpaper, Workpaper } from "./workpaper"

export type WorkpaperLayoutColumn = {
  id: string
  label: string
  role: "primary" | "crossCutting"
  box: string | null
}

export type WorkpaperLayoutRow = {
  billId: string
  cells: Array<{ columnId: string; value: number | null }>
}

export type WorkpaperLayoutBox = {
  box: string
  value: number
  /** Column ids that fed this box. Single-entry for the 1:1 case, multiple for combiner boxes.
   * Renderers use this to draw the "= X + Y + Z" hint next to the box. */
  contributingColumns: string[]
}

export type WorkpaperLayout = {
  workpaperId: string
  label: string
  cadence: Workpaper["cadence"]
  /** Two groups in fixed order: primary first, then crossCutting. Either group may be empty. */
  columnGroups: Array<{
    role: "primary" | "crossCutting"
    columns: WorkpaperLayoutColumn[]
  }>
  rows: WorkpaperLayoutRow[]
  /** Sum row aligned to the flattened column order (primary then crossCutting). */
  totalsRow: Array<{ columnId: string; value: number }>
  boxSummary: WorkpaperLayoutBox[]
  /** #47 Q8: v1 always shows the asserted output-VAT cell. */
  outputVat: { asserted: true }
}

export function layoutWorkpaper(pack: Workpaper, computed: ComputedWorkpaper): WorkpaperLayout {
  const primary: WorkpaperLayoutColumn[] = []
  const crossCutting: WorkpaperLayoutColumn[] = []
  for (const column of pack.columns) {
    const role = column.role === "crossCutting" ? "crossCutting" : "primary"
    const entry: WorkpaperLayoutColumn = {
      id: column.id,
      label: column.label,
      role,
      box: column.box ?? null,
    }
    if (role === "crossCutting") crossCutting.push(entry)
    else primary.push(entry)
  }
  const flatColumns = [...primary, ...crossCutting]

  const rows: WorkpaperLayoutRow[] = computed.rows.map((row) => ({
    billId: row.billId,
    cells: flatColumns.map((c) => ({ columnId: c.id, value: row.values[c.id] ?? null })),
  }))

  const totalsRow = flatColumns.map((c) => ({
    columnId: c.id,
    value: computed.totals[c.id] ?? 0,
  }))

  const boxSummary = buildBoxSummary(pack, computed)

  return {
    workpaperId: pack.id,
    label: pack.label,
    cadence: pack.cadence,
    columnGroups: [
      { role: "primary", columns: primary },
      { role: "crossCutting", columns: crossCutting },
    ],
    rows,
    totalsRow,
    boxSummary,
    outputVat: { asserted: true },
  }
}

function buildBoxSummary(pack: Workpaper, computed: ComputedWorkpaper): WorkpaperLayoutBox[] {
  const contributors: Record<string, string[]> = {}
  for (const column of pack.columns) {
    if (column.box) {
      contributors[column.box] = contributors[column.box] ?? []
      contributors[column.box]!.push(column.id)
    }
  }
  // A top-level combiner declares an authoritative box — record it with an empty contributing
  // list marker if nothing else fed it, or with the union of any 1:1 columns plus a `*` marker
  // signalling that a combiner is in play. Renderers can special-case the `*` if they want a
  // "computed" hint.
  if (pack.boxes) {
    for (const boxKey of Object.keys(pack.boxes)) {
      contributors[boxKey] = contributors[boxKey] ?? []
      if (!contributors[boxKey]!.includes("*")) contributors[boxKey]!.push("*")
    }
  }

  return Object.entries(computed.boxes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([box, value]) => ({
      box,
      value,
      contributingColumns: contributors[box] ?? [],
    }))
}

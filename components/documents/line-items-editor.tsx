"use client"

import type { DocumentItemFieldDefinition } from "@/lib/document-templates"
import type { Ref } from "@/lib/provenance"
import type { LineMatch } from "@/lib/matching/line-match"
import { CheckGlyph, RationalePopover } from "@/components/pipeline/document-detail/rationale-popover"
import type { FieldCheck } from "@/components/pipeline/document-detail/check-types"
import { Breakdown, breakdownFor, formatQuantity, LineStatusPill, MatchGlyph, type BreakdownCell } from "@/components/documents/po-compare"
import { Crosshair, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

type Row = { id: number; values: Record<string, unknown> }

const cellInputClass = "w-full min-w-0 rounded-sm border-0 bg-transparent px-2 py-1.5 text-sm text-slate-800 outline-none focus:bg-emerald-50 focus:ring-1 focus:ring-inset focus:ring-emerald-500"

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== ""

/** #228 Q1/Q2/Q9: what the View PO row needs from the section that owns the toggle. Present only
 * while View PO is on — the plain table keeps today's fail-only check glyph. */
export type PoCompareProps = {
  lines: LineMatch[]
  /** The PO's lines, for Match manually's per-row picker. */
  poLineOptions: Array<{ index: number; label: string }>
  currency: string | null
  invoiceHref: (documentId: string) => string
  /** Match manually is on: each row gets a PO-line picker, edits are pending until Done. */
  matchManually: { assignments: Record<string, number | null>; onAssign: (rowIndex: number, poLineIndex: number | null) => void } | null
}

type CompareCell = Exclude<BreakdownCell, "total">
const COMPARED_KEYS: Record<string, CompareCell> = { quantity: "quantity", unit_price: "unit_price", description: "description" }

/** The grid needs about 560px; narrower than that — the phone (#235's "no horizontal scroller"),
 * or the details column beside the source at 1440 — each line renders as a card with the PO
 * value under the invoice value (#228 Q14). Measured on the container, not the viewport, so the
 * source stays on screen while the reviewer compares. */
const GRID_MIN_WIDTH = 560
function useWide(ref: React.RefObject<HTMLDivElement | null>) {
  const [wide, setWide] = useState(true)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setWide(element.getBoundingClientRect().width >= GRID_MIN_WIDTH)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return wide
}

/** Line items as an actual grid — one row per item, one column per field, cells that edit in
 * place — rather than a stack of bordered cards repeating every label. The header row plus
 * light cell dividers are what make it read as a small spreadsheet instead of a form.
 *
 * Columns are the template's real schema (itemFields), never invented ones — but a column the
 * model never actually extracted anything into, across every row of THIS document, is dropped
 * rather than shown as a wall of empty cells (a required column is the one exception: it stays
 * visible even empty, since a missing required value is itself worth seeing). On a document with
 * no line items yet (a fresh row for someone to fill in by hand), nothing has "not been
 * extracted" yet, so every column shows.
 *
 * With `poCompare` (View PO on, #228), the quantity / unit price / description cells grow a
 * second line — the PO's value with an `=` / `≠` glyph at the right — and a PO line column
 * carries each line's status. */
export function LineItemsEditor({ fieldKey, itemFields, initialRows, provenanceItems, onFocusSource, checks = [], onEscalate, poCompare = null }: {
  fieldKey: string
  itemFields: DocumentItemFieldDefinition[]
  initialRows: Array<Record<string, unknown>>
  provenanceItems?: (Ref | null)[]
  onFocusSource?: (target: { page: number; bbox: Ref["bbox"]; quote: string }) => void
  checks?: FieldCheck[]
  onEscalate?: (check: FieldCheck) => void
  poCompare?: PoCompareProps | null
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const seed = initialRows.length ? initialRows : [{}]
    return seed.map((values, index) => ({ id: index, values }))
  })
  const [openCell, setOpenCell] = useState<string | null>(null)
  // The open breakdown remembers the glyph that opened it (its anchor, and where focus returns).
  const [openBreakdown, setOpenBreakdown] = useState<{ cellId: string; cell: CompareCell; anchor: HTMLElement | null } | null>(null)
  const closeBreakdown = useCallback(() => setOpenBreakdown(null), [])
  const cellRefs = useRef(new Map<string, HTMLInputElement | HTMLSelectElement>())
  const frameRef = useRef<HTMLDivElement>(null)
  const wide = useWide(frameRef)
  const columns = initialRows.length
    ? itemFields.filter((item) => item.required || initialRows.some((row) => hasValue(row[item.key])))
    : itemFields
  const lineByRow = new Map((poCompare?.lines ?? []).map((line) => [line.rowIndex, line]))

  const addRow = () => setRows((current) => [...current, { id: (current.at(-1)?.id ?? -1) + 1, values: {} }])
  const removeRow = (id: number) => setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current))

  const poValueFor = (line: LineMatch, cell: CompareCell): string => {
    if (cell === "quantity") return formatQuantity(line.quantity.po)
    // Plain numbers at the same precision as the invoice cell beside it — the currency is the
    // document's, and "12.5" next to "PO 12.50" reads as two different numbers.
    if (cell === "unit_price") return line.unitPrice.po === null ? "—" : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(line.unitPrice.po)
    return line.description.po ?? "No PO line"
  }
  const cellStatus = (line: LineMatch, cell: CompareCell) =>
    cell === "quantity" ? line.quantity.status : cell === "unit_price" ? line.unitPrice.status : line.poLineIndex === null ? "not_compared" : "match"

  /** One editable cell, with its check glyph (plain table) or its PO compare line (View PO). */
  const renderCell = (row: Row, index: number, item: DocumentItemFieldDefinition, line: LineMatch | null): ReactNode => {
    const inputId = `${fieldKey}-${row.id}-${item.key}`
    const name = `${fieldKey}[${index}][${item.key}]`
    const raw = row.values[item.key]
    const fieldPath = `${fieldKey}[${index}].${item.key}`
    const cellChecks = checks.filter((check) => check.fields.includes(fieldPath))
    const checkDescriptionId = `${fieldPath}-check-description`
    const cellId = `${fieldKey}-${row.id}-${item.key}`
    const compareCell = poCompare && line ? COMPARED_KEYS[item.key] ?? null : null
    const compareStatus = compareCell && line ? cellStatus(line, compareCell) : null
    const compareDescriptionId = `${fieldPath}-po-description`
    const opts = { currency: poCompare?.currency, invoiceHref: poCompare?.invoiceHref ?? (() => "#") }
    const breakdown = compareCell && line && openBreakdown?.cellId === cellId ? breakdownFor(line, compareCell, opts) : null
    const glyph = cellChecks.some((check) => check.status !== "pass" || check.escalated) ? <span className="absolute right-1 top-1/2 -translate-y-1/2"><CheckGlyph checks={cellChecks} onOpen={() => setOpenCell(cellId)} /></span> : null
    return <>
      {item.type === "boolean" ? (
        <label className="flex h-full items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-slate-600">
          <input id={inputId} name={name} type="checkbox" aria-describedby={cellChecks.length ? checkDescriptionId : undefined} className="h-3.5 w-3.5 accent-emerald-600" value="true" defaultChecked={raw === true} />
        </label>
      ) : item.type === "enum" ? (
        <div className="relative flex items-center">
          <select ref={(element) => { if (element) cellRefs.current.set(cellId, element); else cellRefs.current.delete(cellId) }} id={inputId} name={name} aria-describedby={cellChecks.length ? checkDescriptionId : undefined} defaultValue={typeof raw === "string" ? raw : ""} className={`${cellInputClass} appearance-none ${cellChecks.length ? "pr-8" : ""}`}>
            <option value="">—</option>
            {item.options?.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          {glyph}
        </div>
      ) : (
        <div className="relative flex items-center">
          <input ref={(element) => { if (element) cellRefs.current.set(cellId, element); else cellRefs.current.delete(cellId) }} id={inputId} name={name} type={item.type === "number" ? "number" : item.type === "date" ? "date" : "text"} step={item.type === "number" ? "any" : undefined}
            aria-describedby={[cellChecks.length ? checkDescriptionId : null, compareStatus && compareStatus !== "not_compared" ? compareDescriptionId : null].filter(Boolean).join(" ") || undefined}
            className={`${cellInputClass} ${item.type === "number" ? "text-right tabular-nums" : ""} ${cellChecks.length && !poCompare ? "pr-8" : ""}`}
            defaultValue={typeof raw === "string" || typeof raw === "number" ? String(raw) : ""} />
          {!poCompare && glyph}
        </div>
      )}
      {compareCell && line && (compareCell === "description" || line.poLineIndex !== null) && <div className={`flex items-center gap-1.5 px-2 pb-1.5 text-xs ${item.type === "number" ? "justify-end" : "justify-between"}`}>
        <span className={`min-w-0 truncate tabular-nums ${compareStatus === "mismatch" ? "text-red-700" : "text-slate-500"}`} title={line.poLineIndex === null ? undefined : `On the PO: ${poValueFor(line, compareCell)}`}>
          {line.poLineIndex !== null && <span className={`mr-1 text-[11px] font-semibold uppercase tracking-wide ${compareStatus === "mismatch" ? "text-red-400" : "text-slate-400"}`}>PO</span>}{poValueFor(line, compareCell)}
        </span>
        <MatchGlyph status={compareStatus ?? "not_compared"} label={`${item.label}, line ${index + 1}`} describedBy={compareDescriptionId} expanded={openBreakdown?.cellId === cellId}
          onOpen={(anchor) => setOpenBreakdown((current) => current?.cellId === cellId ? null : { cellId, cell: compareCell, anchor })} />
        {compareStatus && compareStatus !== "not_compared" && <span id={compareDescriptionId} hidden>{breakdownFor(line, compareCell, opts).sentence}</span>}
      </div>}
      {cellChecks.length > 0 && <span id={checkDescriptionId} hidden>{cellChecks.map((check) => check.stale ? `${check.message} Not rechecked after this edit.` : check.message).join(" ")}</span>}
      {openCell === cellId && <div className="relative"><RationalePopover rationale={null} mismatchChecks={cellChecks} onClose={() => setOpenCell(null)} onFix={() => cellRefs.current.get(cellId)?.focus()} onEscalate={onEscalate} /></div>}
      {breakdown && <Breakdown title={breakdown.title} sentence={breakdown.sentence} rows={breakdown.rows} onClose={closeBreakdown} returnFocusTo={openBreakdown?.anchor ?? null} />}
    </>
  }

  /** The PO line column: the line's status, or the picker while Match manually is on. */
  const renderPoLine = (index: number, line: LineMatch | null): ReactNode => {
    if (!poCompare) return null
    if (poCompare.matchManually) {
      const pending = poCompare.matchManually.assignments[String(index)]
      // A changed picker is pending until Done: the verdict is not predicted, the change is marked.
      const changed = pending !== undefined && pending !== (line?.poLineIndex ?? null)
      return <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium text-slate-500 lg:hidden">PO line</span>
        <select aria-label={`PO line for line ${index + 1}`} value={pending === undefined ? (line?.poLineIndex ?? "") : (pending ?? "")}
          onChange={(event) => poCompare.matchManually!.onAssign(index, event.target.value === "" ? null : Number(event.target.value))}
          className={`min-h-8 w-full max-w-[14rem] rounded-md border bg-white px-2 py-1 text-xs text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 ${changed ? "border-amber-400 bg-amber-50/60" : "border-slate-300"}`}>
          <option value="">No PO line</option>
          {poCompare.poLineOptions.map((option) => <option key={option.index} value={option.index}>{option.label}</option>)}
        </select>
        {changed && <span className="mt-0.5 block text-[11px] text-amber-800" role="status">Pending — saved on Done, then the checks re-run</span>}
      </label>
    }
    return line
      ? <span className="flex items-center gap-1.5"><LineStatusPill status={line.status} />{line.assigned && <span className="text-[11px] text-slate-500">set by hand</span>}</span>
      : <LineStatusPill status="not_matched" />
  }

  const rowActions = (row: Row, index: number): ReactNode => {
    const rowRef = provenanceItems?.[index] ?? null
    return <div className="flex items-center gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100 lg:pt-1">
      {rowRef && onFocusSource && (
        <button type="button" aria-label="View source" title="View source in document"
          className="rounded p-1 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
          onClick={() => onFocusSource({ page: rowRef.page, bbox: rowRef.bbox, quote: rowRef.quote })}>
          <Crosshair className="h-3.5 w-3.5" />
        </button>
      )}
      <button type="button" aria-label="Remove row" title="Remove row" disabled={rows.length <= 1}
        className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:pointer-events-none disabled:opacity-0"
        onClick={() => removeRow(row.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  }

  const addRowButton = <button type="button" onClick={addRow}
    className="flex w-full items-center gap-1.5 rounded-b-lg border-t border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-emerald-50 hover:text-emerald-700">
    <Plus className="h-3.5 w-3.5" />Add row
  </button>

  // No overflow-hidden on the frame: the check popover and the hidden descriptions live inside
  // the cells, and a ring draws the frame so the table sits flush with no border to inset from.
  if (!wide) {
    return <div ref={frameRef} className="rounded-lg ring-1 ring-slate-200">
      <ul className="divide-y divide-slate-100">
        {rows.map((row, index) => {
          const line = lineByRow.get(index) ?? null
          const description = columns.find((item) => item.key === "description")
          const rest = columns.filter((item) => item !== description)
          return <li key={row.id} className="group space-y-1.5 px-2 py-2">
            {description && <div>
              <span className="block px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{description.label}</span>
              {renderCell(row, index, description, line)}
            </div>}
            <div className="grid grid-cols-3 gap-1">
              {rest.map((item) => <div key={item.key} className="min-w-0">
                <span className={`block px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${item.type === "number" ? "text-right" : ""}`}>{item.label}{item.required ? " *" : ""}</span>
                {renderCell(row, index, item, line)}
              </div>)}
            </div>
            <div className="flex items-center justify-between gap-2 px-2">
              {renderPoLine(index, line)}
              {rowActions(row, index)}
            </div>
          </li>
        })}
      </ul>
      {addRowButton}
    </div>
  }

  return <div ref={frameRef} className="rounded-lg ring-1 ring-slate-200">
    <table className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        {columns.map((item) => <col key={item.key} className={item.key === "description" ? "" : item.type === "number" ? "w-[7rem]" : "w-[8rem]"} />)}
        {poCompare && <col className="w-[8.5rem]" />}
        <col className="w-8" />
      </colgroup>
      <thead>
        <tr className="bg-slate-50">
          {columns.map((item, columnIndex) => <th key={item.key} scope="col" className={`border-b border-slate-200 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${item.type === "number" ? "text-right" : "text-left"} ${columnIndex === 0 ? "rounded-tl-lg" : ""}`}>
            {item.label}{item.required ? " *" : ""}
          </th>)}
          {poCompare && <th scope="col" className="border-b border-slate-200 px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">PO line</th>}
          <th scope="col" className="rounded-tr-lg border-b border-slate-200" aria-label="Row actions" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const line = lineByRow.get(index) ?? null
          return <tr key={row.id} className="group even:bg-slate-50/50 hover:bg-emerald-50/40">
            {columns.map((item) => <td key={item.key} className="border-b border-slate-100 p-0 align-top">{renderCell(row, index, item, line)}</td>)}
            {poCompare && <td className="border-b border-slate-100 px-2 py-1.5 align-top">{renderPoLine(index, line)}</td>}
            <td className="border-b border-slate-100 px-1 text-center align-top">{rowActions(row, index)}</td>
          </tr>
        })}
      </tbody>
    </table>
    {addRowButton}
  </div>
}

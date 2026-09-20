"use client"

import { LineItemsEditor, type PoCompareProps } from "@/components/documents/line-items-editor"
import { Breakdown, formatAmount, MatchGlyph, PoChip, useOriginHere } from "@/components/documents/po-compare"
import { withOrigin } from "@/lib/navigation/origin"
import { MatchManuallyBar } from "@/components/pipeline/document-detail/match-manually"
import type { DocumentFieldDefinition } from "@/lib/document-templates"
import type { Ref } from "@/lib/provenance"
import type { FieldCheck } from "@/components/pipeline/document-detail/check-types"
import type { InvoicePoSummary } from "@/models/po-matching"
import { Crosshair, Equal, EqualNot } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

/** #228 Q9 / #250: the line-items section owns View PO and Match manually. `po` is only supplied
 * for an invoice; every other document type renders the plain table. The summary is the server's
 * — a Match manually change swaps it for the one the action returns, never an optimistic guess
 * (#228 Q14). */
export type LineItemsPoProps = {
  workspaceId: string
  documentId: string
  summary: InvoicePoSummary | null
  currency: string | null
  /** The PO's lines as the reviewer will name them in Match manually. */
  poLineOptions: Array<{ index: number; label: string }>
}

function TotalField({ field, value, ref: provenanceRef, onFocusSource, compare }: {
  field: DocumentFieldDefinition
  value: unknown
  ref: Ref | null
  onFocusSource: (target: { page: number; bbox: Ref["bbox"]; quote: string }) => void
  /** #228 Q1: the Total carries the match-variance gate while View PO is on. */
  compare: { summary: InvoicePoSummary; currency: string | null } | null
}) {
  const [open, setOpen] = useState<HTMLElement | null>(null)
  const closeBreakdown = useCallback(() => setOpen(null), [])
  const gate = compare?.summary.gate ?? null
  const gateOpen = compare?.summary.gateOpen ?? false
  const poTotal = compare?.summary.link?.poTotal ?? null
  const status = !compare || !compare.summary.link || poTotal === null ? "not_compared" : gateOpen ? "mismatch" : "match"
  const sentence = gate
    ? `Invoice total is ${formatAmount(gate.variance, compare?.currency)} off the PO total; the workspace allows ${formatAmount(gate.threshold, compare?.currency)}${gate.percent ? ` (${Math.round(gate.percent * 100)} % of the PO)` : ""}. Approve it in Override Mode with a reason, or change the match in Match manually.`
    : status === "match" ? "Invoice total is within the company tolerance of the PO total." : "The PO has no total to compare."
  // (the sentence names Match manually by its glossary name — "fix the match" is not a control)
  return <div className="group/total relative flex items-center gap-3">
    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
      {field.label}
      {provenanceRef && (
        <button type="button" className="text-emerald-600 opacity-0 transition-opacity group-hover/total:opacity-60 hover:!opacity-100 focus-visible:opacity-100" title="Jump to where this was read in the source" aria-label={`Jump to where ${field.label} was read in the source`}
          onClick={() => onFocusSource({ page: provenanceRef.page, bbox: provenanceRef.bbox, quote: provenanceRef.quote })}>
          <Crosshair className="h-3 w-3" />
        </button>
      )}
    </div>
    <div className="flex flex-col items-end">
      <input id={field.key} name={field.key} type="number" step="any" aria-describedby={compare && status !== "not_compared" ? `${field.key}-po-description` : undefined}
        className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right text-sm tabular-nums text-slate-800 shadow-sm transition-colors focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""} />
      {compare && field.key === "total" && <span className="mt-1 flex items-center gap-1.5 text-xs">
        <span className={`tabular-nums ${status === "mismatch" ? "text-red-700" : "text-slate-500"}`} title={`On the PO: ${formatAmount(poTotal, compare.currency)}`}><span className={`mr-1 text-[11px] font-semibold uppercase tracking-wide ${status === "mismatch" ? "text-red-400" : "text-slate-400"}`} >PO</span>{formatAmount(poTotal, compare.currency)}</span>
        <MatchGlyph status={status} label="Total" describedBy={`${field.key}-po-description`} expanded={open !== null} onOpen={(anchor) => setOpen((current) => current ? null : anchor)} />
        {status !== "not_compared" && <span id={`${field.key}-po-description`} hidden>{sentence}</span>}
      </span>}
    </div>
    {open && compare && <Breakdown title="Total" sentence={sentence} onClose={closeBreakdown} returnFocusTo={open}
      rows={[
        { label: "On the PO", value: formatAmount(poTotal, compare.currency) },
        { label: "This invoice", value: formatAmount(gate?.invoiceTotal ?? (typeof value === "number" ? value : typeof value === "string" ? Number(value) || null : null), compare.currency) },
        { label: "Allowance", value: gate ? formatAmount(gate.threshold, compare.currency) : "—", emphasis: "muted" },
        { label: "Off by", value: gate ? formatAmount(gate.variance, compare.currency) : "—", emphasis: gate ? "over" : undefined },
      ]} />}
  </div>
}

export function LineItemsSection({ field, value, fieldKey, summaryFields, fieldValues, provenanceFields, provenanceItems, onFocusSource, checks = [], onEscalate, po = null }: {
  field: DocumentFieldDefinition
  value: unknown
  fieldKey: string
  summaryFields: DocumentFieldDefinition[]
  fieldValues: Record<string, unknown>
  provenanceFields: Record<string, Ref>
  provenanceItems: (Ref | null)[]
  onFocusSource: (target: { page: number; bbox: Ref["bbox"]; quote: string }) => void
  checks?: FieldCheck[]
  onEscalate?: (check: FieldCheck) => void
  po?: LineItemsPoProps | null
}) {
  const [summary, setSummary] = useState<InvoicePoSummary | null>(po?.summary ?? null)
  // View PO opens by itself when there is something red to see — the count on the chip is the
  // promise, the glyphs are what it promised (#228 Q5). Otherwise the plain table, as decided.
  const [viewPo, setViewPo] = useState<boolean>(() => !!po?.summary?.link && (po.summary.mismatchCount > 0))
  const [matchManually, setMatchManually] = useState(false)
  // The header promises "N mismatches"; when View PO opens by itself the line items come into
  // view so the promise and the glyphs share a viewport.
  const sectionRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!viewPo || !po?.summary?.link || !(po.summary.mismatchCount > 0)) return
    const handle = window.setTimeout(() => sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 150)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, number | null>>({})
  const link = summary?.link ?? null
  const canCompare = !!link && !!summary
  const comparing = canCompare && (viewPo || matchManually)
  const origin = useOriginHere()
  const invoiceHref = useCallback((documentId: string) => withOrigin(`/workspaces/${po?.workspaceId}/invoices/${documentId}`, origin), [po?.workspaceId, origin])

  const compare: PoCompareProps | null = po && canCompare && (viewPo || matchManually) ? {
    lines: summary!.lines,
    poLineOptions: po.poLineOptions,
    currency: po.currency,
    invoiceHref,
    matchManually: matchManually ? { assignments: pendingAssignments, onAssign: (rowIndex, poLineIndex) => setPendingAssignments((current) => ({ ...current, [String(rowIndex)]: poLineIndex })) } : null,
  } : null

  const toggleId = `${fieldKey}-view-po`

  return <div ref={sectionRef} className="scroll-mt-3 space-y-2">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{field.label}</span>
      <div className="h-px min-w-6 flex-1 bg-slate-100" />
      {po && <div className="flex flex-wrap items-center gap-2">
        {summary && (link || summary.suggestions.length || summary.removed)
          ? <PoChip poNumber={link?.poNumber ?? summary.suggestions[0]?.poNumber ?? null} kind={link?.kind ?? (summary.suggestions.length ? "suggested" : null)} mismatchCount={summary.mismatchCount}
            confidence={summary.suggestions[0]?.confidence} suggestionCount={link ? 0 : summary.suggestions.length} removed={summary.removed}
            href={link ? `/workspaces/${po.workspaceId}/purchase-orders/${link.poDocumentId}` : undefined} origin={origin} />
          : <PoChip poNumber={null} kind={null} />}
        {canCompare && <button type="button" id={toggleId} role="switch" aria-checked={viewPo || matchManually} aria-disabled={matchManually || undefined} title={matchManually ? "On while Match manually is open" : undefined} onClick={() => { if (!matchManually) setViewPo((current) => !current) }}
          className={`inline-flex min-h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-70 ${viewPo || matchManually ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
          <span aria-hidden="true" className={`inline-flex h-3.5 w-6 items-center rounded-full px-0.5 transition-colors ${viewPo || matchManually ? "justify-end bg-emerald-600" : "justify-start bg-slate-300"}`}>
            <span className="h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          View PO
        </button>}
        {!matchManually && <button type="button" onClick={() => { setPendingAssignments({}); setMatchManually(true) }}
          className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          Match manually
        </button>}
      </div>}
    </div>
    {po && summary && !link && summary.suggestions.length > 0 && !matchManually && <p className="px-1 text-xs text-slate-600">
      Suggested by the matcher — nothing is compared until it is confirmed in Match manually.
    </p>}
    {po && comparing && <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-slate-600">
      <span className="inline-flex items-center gap-1"><Equal className="h-3 w-3 text-emerald-700/80" aria-hidden="true" /> matches the PO</span>
      <span className="inline-flex items-center gap-1"><EqualNot className="h-3 w-3 text-red-700" aria-hidden="true" /> off the PO</span>
      <span>Select a mark for the arithmetic.</span>
    </p>}
    {po && matchManually && summary !== undefined && <MatchManuallyBar
      workspaceId={po.workspaceId} documentId={po.documentId} summary={summary} currency={po.currency}
      pendingAssignments={pendingAssignments}
      onSummary={(next) => { setSummary(next); if (next?.link) setViewPo(true) }}
      onDone={() => { setMatchManually(false); setPendingAssignments({}) }}
      onDiscard={() => { setMatchManually(false); setPendingAssignments({}) }} />}
    {field.itemFields?.length
      ? <LineItemsEditor fieldKey={fieldKey} itemFields={field.itemFields} initialRows={Array.isArray(value) ? value as Array<Record<string, unknown>> : []} provenanceItems={provenanceItems} onFocusSource={onFocusSource} checks={checks} onEscalate={onEscalate} poCompare={compare} />
      : <textarea id={fieldKey} name={fieldKey} defaultValue={Array.isArray(value) ? JSON.stringify(value) : ""} placeholder="JSON array" className="min-h-24 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 font-mono text-sm" />}
    {summaryFields.length > 0 && <div className="flex flex-wrap items-start justify-end gap-4 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-2.5">
      {summaryFields.map((summaryField) => <TotalField key={summaryField.key} field={summaryField} value={fieldValues[summaryField.key]} ref={provenanceFields[summaryField.key] ?? null} onFocusSource={onFocusSource}
        compare={compare && summary && summaryField.key === "total" ? { summary, currency: po?.currency ?? null } : null} />)}
    </div>}
  </div>
}

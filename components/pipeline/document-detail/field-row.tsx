"use client"

import { LineItemsEditor } from "@/components/documents/line-items-editor"
import { CheckGlyph, RationalePopover, SOURCE_BADGE } from "@/components/pipeline/document-detail/rationale-popover"
import type { FieldCheck } from "@/components/pipeline/document-detail/check-types"
import type { DocumentFieldDefinition } from "@/lib/document-templates"
import type { FieldRationale } from "@/lib/rationale"
import type { Ref } from "@/lib/provenance"
import { Crosshair, Pencil } from "lucide-react"
import { useRef, useState } from "react"

const LOW_CONFIDENCE = 0.6

export function FieldRow({ field, value, confidence, ref: provenanceRef, onFocusSource, rationale, checks = [], onEscalate, registerNav, isCurrent, isCompleted }: {
  field: DocumentFieldDefinition
  value: unknown
  confidence: number | null
  ref: Ref | null
  onFocusSource: (target: { page: number; bbox: Ref["bbox"]; quote: string }) => void
  rationale?: FieldRationale | null
  checks?: FieldCheck[]
  onEscalate?: (check: FieldCheck) => void
  /** A4.1: registers the row's wrapper with use-field-nav so the reviewer can jump straight
   * to the lowest-confidence field. Optional so other callers of FieldRow don't have to know
   * about the navigator. */
  registerNav?: (key: string, element: HTMLElement | null) => void
  isCurrent?: boolean
  isCompleted?: boolean
}) {
  const lowConfidence = typeof confidence === "number" && confidence < LOW_CONFIDENCE
  const isArray = field.type === "array"
  const [showPopover, setShowPopover] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)
  const checkDescriptionId = `${field.key}-check-description`

  if (isArray) {
    return <div className="pt-2">
      {field.itemFields?.length
        ? <LineItemsEditor fieldKey={field.key} itemFields={field.itemFields} initialRows={Array.isArray(value) ? value as Array<Record<string, unknown>> : []} checks={checks} onEscalate={onEscalate} />
        : <textarea id={field.key} name={field.key} defaultValue={Array.isArray(value) ? JSON.stringify(value) : ""} placeholder="JSON array" className="min-h-24 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 font-mono text-sm" />}
    </div>
  }

  // Suppress the plain "Extracted" badge on every field — it restated what the presence of a
  // value already implied. Rule / AI / History / Learned still render, and low-confidence
  // extraction is shown via the existing amber "Low confidence" pill above.
  const badge = rationale && rationale.source !== "extraction" ? SOURCE_BADGE[rationale.source] : null

  return <div ref={(el) => registerNav?.(field.key, el)}
    data-field-key={field.key} data-suspect={lowConfidence || undefined} data-current={isCurrent || undefined} data-completed={isCompleted || undefined}
    className={`group relative rounded-lg transition-colors ${lowConfidence ? "bg-amber-50/80 ring-1 ring-amber-200" : ""} ${isCurrent ? "outline outline-2 outline-emerald-400" : ""} ${isCompleted ? "opacity-70" : ""}`}>
    <div className="flex items-center gap-2 px-1 pb-1">
      <label htmlFor={field.key} className="text-xs font-medium text-slate-500">
        {field.label}{field.required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {lowConfidence && <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">Low confidence</span>}
      <CheckGlyph checks={checks} onOpen={() => setShowPopover(true)} />
      {badge && <button type="button" onClick={() => setShowPopover(!showPopover)}
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold transition-opacity ${badge.className}`}>
        <badge.icon className="h-2.5 w-2.5" />{badge.label}
      </button>}
      {provenanceRef ? (
        <button type="button" className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:bg-emerald-50"
          onClick={() => onFocusSource({ page: provenanceRef.page, bbox: provenanceRef.bbox, quote: provenanceRef.quote })}
          title="Jump to where this was read in the source">
          <Crosshair className="h-3 w-3" />Source
        </button>
      ) : (
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" title="No source pin — entered by hand or unresolved">
          <Pencil className="h-2.5 w-2.5" />Manual
        </span>
      )}
    </div>

    {checks.length > 0 && <span id={checkDescriptionId} className="sr-only">{checks.map((check) => check.stale ? `${check.message} Not rechecked after this edit.` : check.message).join(" ")}</span>}
    {showPopover && (rationale || checks.length > 0) && <RationalePopover rationale={rationale} mismatchChecks={checks} onClose={() => setShowPopover(false)} onFix={() => inputRef.current?.focus()} onEscalate={onEscalate} />}

    {field.type === "boolean" ? (
      <label className="flex items-center gap-2 px-1 pb-1 text-sm text-slate-700"><input ref={inputRef as React.RefObject<HTMLInputElement>} id={field.key} name={field.key} type="checkbox" aria-describedby={checks.length ? checkDescriptionId : undefined} className="h-4 w-4 rounded accent-emerald-600" value="true" defaultChecked={value === true} />Yes</label>
    ) : field.type === "enum" ? (
      <select ref={inputRef as React.RefObject<HTMLSelectElement>} id={field.key} name={field.key} aria-describedby={checks.length ? checkDescriptionId : undefined} defaultValue={typeof value === "string" ? value : ""} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 transition-colors focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100">
        <option value="">Select a value</option>
        {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    ) : (
      <input ref={inputRef as React.RefObject<HTMLInputElement>} id={field.key} name={field.key} aria-describedby={checks.length ? checkDescriptionId : undefined}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        step={field.type === "number" ? "any" : undefined}
        defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        className={`h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-300 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 ${field.type === "number" ? "tabular-nums" : ""}`} />
    )}
  </div>
}

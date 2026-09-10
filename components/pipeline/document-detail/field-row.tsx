"use client"

import { LineItemsEditor } from "@/components/documents/line-items-editor"
import type { DocumentFieldDefinition } from "@/lib/document-templates"
import type { FieldRationale } from "@/lib/rationale"
import type { Ref } from "@/lib/provenance"
import { BookOpen, Bot, Crosshair, Info, Pencil, Sparkles, X } from "lucide-react"
import { useState } from "react"

const LOW_CONFIDENCE = 0.6

const SOURCE_BADGE: Record<string, { label: string; className: string; icon: typeof Sparkles }> = {
  rule: { label: "Rule", className: "bg-blue-50 text-blue-700 border-blue-200", icon: BookOpen },
  ai: { label: "AI", className: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: Bot },
  // Phase 3: vendor history — visually distinct from AI (green ✅ for "we're sure") vs indigo bot
  // ("model best guess") vs rule ("a person authored this"). Same Sparkles icon as few_shot since
  // both signal "learned from prior data" — the color separates the two.
  history: { label: "History", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Sparkles },
  few_shot: { label: "Learned", className: "bg-purple-50 text-purple-700 border-purple-200", icon: Sparkles },
  extraction: { label: "Extracted", className: "bg-slate-50 text-slate-600 border-slate-200", icon: Info },
}

export function FieldRow({ field, value, confidence, ref: provenanceRef, onFocusSource, rationale, registerNav, isCurrent, isCompleted }: {
  field: DocumentFieldDefinition
  value: unknown
  confidence: number | null
  ref: Ref | null
  onFocusSource: (target: { page: number; bbox: Ref["bbox"]; quote: string }) => void
  rationale?: FieldRationale | null
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

  if (isArray) {
    return <div className="pt-2">
      {field.itemFields?.length
        ? <LineItemsEditor fieldKey={field.key} itemFields={field.itemFields} initialRows={Array.isArray(value) ? value as Array<Record<string, unknown>> : []} />
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

    {showPopover && rationale && <RationalePopover rationale={rationale} onClose={() => setShowPopover(false)} />}

    {field.type === "boolean" ? (
      <label className="flex items-center gap-2 px-1 pb-1 text-sm text-slate-700"><input id={field.key} name={field.key} type="checkbox" className="h-4 w-4 rounded accent-emerald-600" value="true" defaultChecked={value === true} />Yes</label>
    ) : field.type === "enum" ? (
      <select id={field.key} name={field.key} defaultValue={typeof value === "string" ? value : ""} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 transition-colors focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100">
        <option value="">Select a value</option>
        {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    ) : (
      <input id={field.key} name={field.key}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        step={field.type === "number" ? "any" : undefined}
        defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        className={`h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-300 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 ${field.type === "number" ? "tabular-nums" : ""}`} />
    )}
  </div>
}

function RationalePopover({ rationale, onClose }: { rationale: FieldRationale; onClose: () => void }) {
  const badge = SOURCE_BADGE[rationale.source]!
  const confidencePct = rationale.confidence !== null ? `${(rationale.confidence * 100).toFixed(0)}%` : null

  return <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
    <div className="mb-2 flex items-center justify-between">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
        <badge.icon className="h-3 w-3" />{badge.label}
      </span>
      <button type="button" onClick={onClose} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>

    <dl className="space-y-1.5 text-xs">
      {confidencePct && <div className="flex items-center gap-2">
        <dt className="font-medium text-slate-500">Confidence</dt>
        <dd className={`font-semibold ${rationale.confidence! >= 0.8 ? "text-emerald-700" : rationale.confidence! >= 0.6 ? "text-amber-700" : "text-red-700"}`}>{confidencePct}</dd>
      </div>}

      {rationale.source === "rule" && rationale.ruleName && <div className="flex items-center gap-2">
        <dt className="font-medium text-slate-500">Rule</dt>
        <dd className="text-slate-700">{rationale.ruleName}</dd>
      </div>}

      {rationale.source === "ai" && rationale.aiRationale && <div>
        <dt className="font-medium text-slate-500">AI reasoning</dt>
        <dd className="mt-0.5 rounded bg-indigo-50 px-2 py-1 text-slate-700">{rationale.aiRationale}</dd>
      </div>}

      {rationale.source === "few_shot" && rationale.correctionExample && <div>
        <dt className="font-medium text-slate-500">Learned from correction</dt>
        <dd className="mt-0.5 rounded bg-purple-50 px-2 py-1 text-slate-700">
          <span className="line-through text-slate-400">{rationale.correctionExample.wrongValue}</span>
          <span className="mx-1 text-slate-400">&rarr;</span>
          <span className="font-medium">{rationale.correctionExample.correctedValue}</span>
        </dd>
      </div>}

      {rationale.provenanceQuote && <div>
        <dt className="font-medium text-slate-500">Source text</dt>
        <dd className="mt-0.5 rounded bg-slate-50 px-2 py-1 italic text-slate-600">&ldquo;{rationale.provenanceQuote}&rdquo;</dd>
      </div>}
    </dl>
  </div>
}

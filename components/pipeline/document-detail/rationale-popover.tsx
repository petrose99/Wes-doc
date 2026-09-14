"use client"

import type { FieldRationale, FieldSource } from "@/lib/rationale"
import { AlertCircle, AlertTriangle, BookOpen, Bot, Check, CircleHelp, Crosshair, Flag, Info, Pencil, Sparkles, X } from "lucide-react"
import type { FieldCheck } from "./check-types"
import { checkLabel } from "./check-types"

export const SOURCE_BADGE: Record<FieldSource, { label: string; className: string; icon: typeof Sparkles }> = {
  rule: { label: "Rule", className: "bg-blue-50 text-blue-700 border-blue-200", icon: BookOpen },
  ai: { label: "AI", className: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: Bot },
  history: { label: "History", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Sparkles },
  few_shot: { label: "Learned", className: "bg-purple-50 text-purple-700 border-purple-200", icon: Sparkles },
  extraction: { label: "Extracted", className: "bg-slate-50 text-slate-600 border-slate-200", icon: Info },
}

export function CheckGlyph({ checks, onOpen }: { checks: FieldCheck[]; onOpen: () => void }) {
  if (!checks.length) return null
  const allEscalated = checks.every((check) => check.escalated)
  const hasFail = checks.some((check) => check.status === "fail")
  const stale = checks.some((check) => check.stale)
  const label = allEscalated ? "Escalated to Exceptions" : hasFail ? "Failed check" : "Check needs review"
  const Icon = allEscalated ? Flag : hasFail ? AlertCircle : stale ? CircleHelp : AlertTriangle
  return <button type="button" aria-label={`${label}: ${checks.map((check) => check.message).join("; ")}`} title={stale ? "Not rechecked after this edit" : label}
    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${allEscalated ? "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100" : hasFail ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" : stale ? "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200" : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"}`}
    onClick={onOpen}><Icon className="h-3.5 w-3.5" aria-hidden="true" /></button>
}

export function RationalePopover({ rationale, mismatchChecks = [], onClose, onFix, onEscalate }: {
  rationale?: FieldRationale | null
  mismatchChecks?: FieldCheck[]
  onClose: () => void
  onFix?: () => void
  onEscalate?: (check: FieldCheck) => void
}) {
  const badge = rationale ? SOURCE_BADGE[rationale.source] : null
  const confidencePct = rationale?.confidence !== null && rationale?.confidence !== undefined ? `${(rationale.confidence * 100).toFixed(0)}%` : null

  return <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[min(28rem,calc(100vh-2rem))] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
    <div className="mb-2 flex items-center justify-between">
      {badge ? <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
        <badge.icon className="h-3 w-3" />{badge.label}
      </span> : <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Check details</span>}
      <button type="button" onClick={onClose} aria-label="Close check details" className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>

    {mismatchChecks.length > 0 && <section className="mb-3 border-b border-slate-100 pb-3" aria-label="Check results">
      <h3 className="text-xs font-semibold text-slate-700">Why this needs review</h3>
      <div className="mt-2 space-y-2">
        {mismatchChecks.map((check) => <div key={check.id} className={check.escalated ? "rounded-md bg-purple-50 px-2.5 py-2 text-xs text-slate-700" : "rounded-md bg-amber-50 px-2.5 py-2 text-xs text-slate-700"}>
          <div className="flex items-start gap-2">
            {check.escalated ? <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-700" aria-hidden="true" /> : check.status === "fail" ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-700" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">{checkLabel(check.checkCode)}{check.escalated ? " · Escalated" : check.stale ? " · Not rechecked" : ""}</p>
              <p className={check.stale ? "mt-0.5 text-slate-500" : "mt-0.5 text-slate-700"}>{check.escalated ? "Flagged as a document problem, not an extraction error. Sent to the Exceptions queue." : check.stale ? "This check uses the last saved values. Save the document to run it again." : check.message}</p>
            </div>
          </div>
          {!check.escalated && <div className="mt-2 flex flex-wrap gap-2 pl-5">
            <button type="button" onClick={onFix} className="inline-flex min-h-6 items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
              <Pencil className="h-3 w-3" aria-hidden="true" />Fix this cell
            </button>
            <button type="button" onClick={() => onEscalate?.(check)} className="inline-flex min-h-6 items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
              <Crosshair className="h-3 w-3" aria-hidden="true" />Escalate
            </button>
          </div>}
        </div>)}
      </div>
    </section>}

    {rationale && <dl className="space-y-1.5 text-xs">
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
        <dd className="mt-0.5 rounded bg-indigo-50 px-2 py-1 text-indigo-800">{rationale.aiRationale}</dd>
      </div>}

      {rationale.source === "few_shot" && rationale.correctionExample && <div>
        <dt className="font-medium text-slate-500">Learned from correction</dt>
        <dd className="mt-0.5 rounded bg-purple-50 px-2 py-1 text-purple-800">
          <span className="line-through text-slate-400">{rationale.correctionExample.wrongValue}</span>
          <span className="mx-1 text-slate-400">&rarr;</span>
          <span className="font-medium">{rationale.correctionExample.correctedValue}</span>
        </dd>
      </div>}

      {rationale.provenanceQuote && <div>
        <dt className="font-medium text-slate-500">Source text</dt>
        <dd className="mt-0.5 rounded bg-slate-50 px-2 py-1 italic text-slate-600">&ldquo;{rationale.provenanceQuote}&rdquo;</dd>
      </div>}
    </dl>}
  </div>
}

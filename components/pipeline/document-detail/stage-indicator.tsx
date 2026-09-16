import { AlertTriangle, Banknote, Check, CheckCircle2, Circle, FileSearch, Send, ShieldCheck } from "lucide-react"

/** The five-step lifecycle indicator on the document detail top bar: Extracted -> Checks ->
 * Approval -> Sync -> Pay. Answers the storyboard question "where is this bill?" without the
 * reader having to reconstruct it from status pills, integration cards and the review tab.
 *
 * Every step is one of four states:
 *   done      the step is finished (a solid check, emerald)
 *   current   the document is currently on this step (a hollow ring, indigo)
 *   blocked   the step failed or is stuck waiting on a specific person (amber triangle)
 *   upcoming  not yet reached (slate)
 *
 * The `detail` line under each label is what makes the indicator load-bearing rather than
 * decorative — "Awaiting approval — Line manager" reads instantly, where "Approval: in review"
 * still leaves the reader wondering who. Server-derived; this component has no state of its own. */

export type StageStep = {
  key: "extracted" | "checks" | "approval" | "sync" | "pay"
  label: string
  state: "done" | "current" | "blocked" | "upcoming"
  detail?: string
}

const ICONS = {
  extracted: FileSearch,
  checks: ShieldCheck,
  approval: CheckCircle2,
  sync: Send,
  pay: Banknote,
} as const

/** The step the document is on: the first `current` or `blocked` step, else the last `done`. */
function currentStep(steps: StageStep[]): { step: StageStep; index: number } | null {
  const active = steps.findIndex((step) => step.state === "current" || step.state === "blocked")
  if (active >= 0) return { step: steps[active], index: active }
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].state === "done") return { step: steps[i], index: i }
  return steps.length ? { step: steps[0], index: 0 } : null
}

/** One 36px band under the pane header (#259 §3). `lg+`: the five nodes in a row, nothing
 * scrolls — they fit in 830px. Below `lg`: one line, the current node and "n of N", so the band
 * never clips "Pay" at 390 the way the scrolling pill list did. Both forms render; CSS picks. */
export function StageIndicator({ steps }: { steps: StageStep[] }) {
  const current = currentStep(steps)
  const currentColor = current?.step.state === "blocked" ? "text-amber-800" : current?.step.state === "done" ? "text-emerald-700" : "text-indigo-700"
  return <div className="flex h-9 items-center overflow-hidden border-b border-slate-200 px-3 text-xs">
    {current && <p className={`flex min-w-0 items-center gap-1.5 font-medium lg:hidden ${currentColor}`}>
      <span className="sr-only">Step {current.index + 1} of {steps.length}, </span>
      <span className="truncate">{current.step.label}{current.step.detail && current.step.state !== "upcoming" ? ` — ${current.step.detail}` : ""}</span>
      <span className="shrink-0 tabular-nums text-slate-500" aria-hidden="true">· {current.index + 1} of {steps.length}</span>
    </p>}
    <ol className="hidden items-center gap-1.5 lg:flex" aria-label="Document lifecycle">
    {steps.map((step, index) => {
      const Icon = ICONS[step.key]
      const stateClass =
        step.state === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : step.state === "current" ? "border-indigo-200 bg-indigo-50 text-indigo-700"
        : step.state === "blocked" ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-400"
      const dotIcon = step.state === "done" ? Check
        : step.state === "blocked" ? AlertTriangle
        : step.state === "current" ? Icon
        : Circle
      const DotIcon = dotIcon
      return <li key={step.key} className="flex shrink-0 items-center gap-1.5">
        {index > 0 && <span className={`hidden h-px w-4 shrink-0 sm:block ${steps[index - 1].state === "done" ? "bg-emerald-300" : "bg-slate-200"}`} aria-hidden="true" />}
        <div className={`flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 ${stateClass}`} title={step.detail}>
          <DotIcon className="h-3 w-3 shrink-0" />
          <span className="truncate font-medium">{step.label}</span>
          {step.detail && step.state !== "upcoming" && <span className="hidden truncate text-[11px] opacity-90 md:inline">— {step.detail}</span>}
        </div>
      </li>
    })}
    </ol>
  </div>
}

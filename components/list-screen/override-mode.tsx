"use client"

import { useState } from "react"
import { ShieldAlert, ShieldCheck } from "lucide-react"

/** #203: session-level Override Mode, Vic-style "Enter Manual Match Mode". Not a server session —
 * a client-side UI mode scoped to whichever list screen mounted it. Deliberately plain `useState`
 * rather than a React Context: this codebase has no Context anywhere yet (grepped before adding
 * one), InvoiceTable/ReceiptTable already lift denser state than this the same way (`selected`,
 * `expandedId`), and the mode only ever needs to reach two siblings one prop-hop apart (the bar
 * here and SelectionAuditPanel) — a Context would be solving a fan-out problem this doesn't have.
 *
 * Auto-exit: on navigating away from the surface, not on an idle timer. The hook's state lives in
 * InvoiceTable/ReceiptTable, which React unmounts on route change, so leaving the screen already
 * clears it for free — a timer would be solving a problem the component tree already solves, and
 * would surprise an operator mid-review who paused to read something. Re-entering the screen
 * always starts back in the default (off) state, so a stale "on" mode can never persist across a
 * page load. */
export function useOverrideMode() {
  const [active, setActive] = useState(false)
  return {
    active,
    enter: () => setActive(true),
    exit: () => setActive(false),
    toggle: () => setActive((current) => !current),
  }
}

/** The entry/exit affordance and the persistent visual indicator in one control, rendered as a
 * strip above the table — the same tree level as ListScreenBulkActionBar, always visible
 * regardless of selection (unlike the bulk bar, which only appears once rows are selected). Amber
 * throughout, matching the "acknowledged without full resolution" tone already used for the Close
 * checklist's Override chip (bg-amber-100 text-amber-800) — violet is reserved for the Touchless
 * pill's "automation happened" signal, which is a different kind of fact than "a human is now
 * allowed to wave things through". */
export function OverrideModeBar({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  if (!active) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-6 py-2">
        <p className="text-xs text-slate-500">
          Soft-gate findings (match, confidence, trust, workspace checks) can be overridden with a reason. Jurisdiction, duplicate, and SMB-ceiling checks never can.
        </p>
        <button type="button" onClick={onToggle}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100">
          <ShieldAlert className="h-3.5 w-3.5" />
          Enter Override Mode
        </button>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2" role="status">
      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
        <ShieldCheck className="h-3.5 w-3.5" />
        Override Mode is on — soft-gate findings on this screen can be overridden with a reason. Select a row to see its open exceptions.
      </p>
      <button type="button" onClick={onToggle}
        className="inline-flex shrink-0 items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100">
        Exit Override Mode
      </button>
    </div>
  )
}

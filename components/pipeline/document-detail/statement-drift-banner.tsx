"use client"

import { acceptStatementLayoutAction, escalateCheckAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import type { FieldCheck } from "@/components/pipeline/document-detail/check-types"
import { AlertTriangle, Flag, Info, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** #217: the bank-statement split-pane's own banner slot, shown above the generic
 * missing-fields/conflicting-pages banner (it always renders first when applicable — see
 * split-pane.tsx). Three states, one component, because they're mutually exclusive readings of
 * the same signal (this statement's institutionId + its `statement_layout_drift` check row):
 *
 *   - No institution asserted yet: renders nothing — the InstitutionAssert control above it in
 *     the Details tab is the prompt, not this banner.
 *   - Institution asserted, no drift check row: `not_applicable` per the pure evaluator
 *     (lib/checks/statement-layout-drift.ts) — either this is the institution's first statement
 *     (checkStatementDriftAgainstInstitution just learned the layout and produced no CheckResult
 *     at all, see models/document-checks.ts) or the check simply hasn't run yet. Both read the
 *     same to a reviewer: nothing to compare against, which is calm, not broken — so this is an
 *     informational note, not a warning.
 *   - A `statement_layout_drift` check row exists and is unresolved (`warn`, not escalated):
 *     drift was found. Reviewer picks one of two mutually exclusive resolutions; neither is
 *     silent or automatic (#207/#217's resolution: confirmed drift never auto-updates the saved
 *     layout).
 */
export function StatementDriftBanner({ workspaceId, documentId, institutionName, driftCheck }: {
  workspaceId: string
  documentId: string
  institutionName: string | null
  /** The statement_layout_drift row from the document's `checks` list, or null when none exists
   * yet (first statement / not yet run). Pass-status rows (a prior "Accept as new layout") also
   * read as null here — nothing left to show. */
  driftCheck: FieldCheck | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<"accept" | "flag" | null>(null)

  const accept = async () => {
    setBusy("accept")
    try {
      const result = await acceptStatementLayoutAction(workspaceId, documentId)
      if (!result.success) { toast.error(result.error || "Could not accept this layout"); return }
      toast.success("Saved as the new layout for this institution")
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(null)
    }
  }

  const flag = async () => {
    setBusy("flag")
    try {
      const result = await escalateCheckAction(workspaceId, documentId, "statement_layout_drift")
      if (!result.success) { toast.error(result.error || "Could not flag this statement"); return }
      toast.success("Flagged as an anomaly")
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(null)
    }
  }

  if (!driftCheck) {
    return <div className="border-b border-blue-100 bg-blue-50/70 px-6 py-2 text-sm text-blue-800">
      <p className="flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {institutionName ? `First statement for ${institutionName} — this becomes the saved layout.` : "First statement for this institution — this becomes the saved layout."}
      </p>
    </div>
  }

  if (driftCheck.escalated) {
    return <div className="border-b border-purple-100 bg-purple-50/70 px-6 py-2.5 text-sm text-purple-800">
      <p className="flex items-start gap-1.5 font-medium">
        <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Flagged as an anomaly and sent to the <Link href={`/workspaces/${workspaceId}/exceptions`} className="underline underline-offset-2 hover:text-purple-900">Exceptions queue</Link>. The saved layout was left unchanged.
      </p>
    </div>
  }

  if (driftCheck.status !== "warn") return null

  const changes = Array.isArray(driftCheck.detail?.changes)
    ? (driftCheck.detail!.changes as unknown[]).filter((change): change is string => typeof change === "string")
    : []

  return <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900">
    <div className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">This statement&apos;s layout differs from the saved layout for {institutionName ?? "this institution"}</p>
        {changes.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-800">
          {changes.map((change, index) => <li key={index}>{change}</li>)}
        </ul>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void accept()}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:pointer-events-none disabled:opacity-40">
            {busy === "accept" && <Loader2 className="h-3 w-3 animate-spin" />}Accept as new layout
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void flag()}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-40">
            {busy === "flag" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flag className="h-3 w-3" aria-hidden="true" />}Flag as anomaly
          </button>
        </div>
      </div>
    </div>
  </div>
}

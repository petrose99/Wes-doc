import { CheckCircle2 } from "lucide-react"

/** The Approved tab's status strip. Informational only: approved documents are in Docu
 * Search automatically (library membership follows from the reviewed status, not a second
 * "store" click) and sync to the connected accounting provider automatically on approval (see
 * lib/automation/autopublish.ts::syncOnApproval). The old "Push to Docu Search" / "Push to
 * Accounting" buttons and the auto-store retention dropdown are gone — the audit flagged the
 * strip for mixing a persistent setting with one-shot actions, and the redesign made both
 * actions the default rather than a chore. */
export function ReadyBanner({ count }: { workspaceId?: string; count: number; documentIds?: string[] }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-emerald-50/60 px-6 py-2.5 text-[13px] text-emerald-800">
    <CheckCircle2 className="h-3.5 w-3.5" />
    <span className="font-medium">{count} approved</span>
    <span className="text-emerald-600">·</span>
    <span className="text-emerald-600/90">in Docu Search and syncing to accounting automatically — nothing left to click.</span>
  </div>
}

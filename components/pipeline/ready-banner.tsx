"use client"

import {
  archiveDocumentsAction,
} from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { ArrowRight, Calculator, Library, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

const DURATION_OPTIONS = [
  { label: "12 hours", value: 12 },
  { label: "24 hours", value: 24 },
  { label: "48 hours", value: 48 },
  { label: "7 days", value: 168 },
  { label: "Never", value: 0 },
]

export function ReadyBanner({ workspaceId, count, documentIds }: { workspaceId: string; count: number; documentIds: string[] }) {
  const router = useRouter()
  const [duration, setDuration] = useState(24)
  const [pushing, setPushing] = useState(false)

  async function pushToLibrary() {
    if (documentIds.length === 0) return
    setPushing(true)
    try {
      const result = await archiveDocumentsAction(workspaceId, documentIds, true)
      if (!result.success) { toast.error(result.error || "Could not push to library"); return }
      const updated = result.data?.updated ?? documentIds.length
      toast.success(`${updated} document${updated === 1 ? "" : "s"} pushed to Docu Library`)
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setPushing(false)
    }
  }

  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-emerald-50/60 px-6 py-2.5 text-[13px] text-emerald-800">
    <span className="font-medium">{count} document{count === 1 ? "" : "s"} ready</span>
    <span className="text-emerald-600">·</span>
    <span className="inline-flex items-center gap-1.5 text-emerald-600/80">
      Auto-stored to Docu Library after
      <select
        value={duration}
        onChange={(e) => setDuration(Number(e.target.value))}
        className="rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-xs font-medium text-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-500">
        {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
    <span className="text-emerald-600">·</span>
    <button
      type="button"
      disabled={pushing || documentIds.length === 0}
      onClick={() => void pushToLibrary()}
      className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900 disabled:opacity-50">
      {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Library className="h-3.5 w-3.5" />}
      Push to Docu Library
    </button>
    <span className="text-emerald-600">·</span>
    <Link href={`/workspaces/${workspaceId}/accounting`} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900">
      <Calculator className="h-3.5 w-3.5" /> Push to Accounting
    </Link>
  </div>
}

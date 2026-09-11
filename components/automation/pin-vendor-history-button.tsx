"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2 } from "lucide-react"

import { pinVendorHistoryToRuleAction } from "@/app/(app)/workspaces/[workspaceId]/automation/vendors/actions"

/** Pin a vendor history row into an explicit AutomationRule with one click. Only shown when the
 * viewer is a workspace owner (checked server-side; a member gets a no-op error toast).
 *
 * `initialRuleId` is set when the page already found a "Pinned: <supplier>" rule for this row —
 * the button opens straight into the pinned state instead of inviting a second, silently
 * duplicate pin. */
export function PinVendorHistoryButton({ workspaceId, supplier, templateCode, coding, initialRuleId = null }: {
  workspaceId: string
  supplier: string
  templateCode: string
  coding: Record<string, string>
  initialRuleId?: string | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [ruleId, setRuleId] = useState(initialRuleId)

  const pin = async () => {
    setPending(true)
    try {
      const result = await pinVendorHistoryToRuleAction({ workspaceId, supplier, templateCode, coding })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setRuleId(result.ruleId)
      toast.success(result.alreadyPinned ? `"${supplier}" was already pinned` : `Pinned "${supplier}" as a rule`)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  if (ruleId) {
    return <span className="inline-flex items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Pinned
      </span>
      <Link href={`/workspaces/${workspaceId}/settings/rules`} className="text-slate-500 underline underline-offset-2 hover:text-slate-800">
        View rule
      </Link>
    </span>
  }

  return <button
    type="button"
    onClick={() => void pin()}
    disabled={pending}
    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
  >
    {pending ? "Pinning…" : "Pin as rule"}
  </button>
}

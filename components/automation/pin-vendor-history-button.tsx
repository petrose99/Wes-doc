"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { pinVendorHistoryToRuleAction } from "@/app/(app)/workspaces/[workspaceId]/automation/vendors/actions"

/** Pin a vendor history row into an explicit AutomationRule with one click. Only shown when the
 * viewer is a workspace owner (checked server-side; a member gets a no-op error toast). */
export function PinVendorHistoryButton({ workspaceId, supplier, templateCode, coding }: {
  workspaceId: string
  supplier: string
  templateCode: string
  coding: Record<string, string>
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const pin = async () => {
    setPending(true)
    try {
      const result = await pinVendorHistoryToRuleAction({ workspaceId, supplier, templateCode, coding })
      if ("error" in result) toast.error(result.error)
      else { toast.success(`Pinned "${supplier}" as a rule`); router.refresh() }
    } finally {
      setPending(false)
    }
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

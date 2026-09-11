"use client"

import { setDeferredVatSchemeAction } from "@/app/(app)/workspaces/[workspaceId]/jurisdiction-actions"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

/** #84: tri-state picker for the workspace's deferred-import-VAT scheme enrolment. `null` = not
 * stated, `true` = enrolled, `false` = explicitly not enrolled. LS's VAT-12 return-form
 * workpaper (#85) is the only v1 consumer; other packs ignore the flag. Owner-only edit —
 * other members see read-only text. */
export function DeferredVatSchemePicker({
  workspaceId,
  current,
  isOwner,
}: {
  workspaceId: string
  current: boolean | null
  isOwner: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const asString = (v: boolean | null): "unset" | "enrolled" | "not-enrolled" =>
    v === true ? "enrolled" : v === false ? "not-enrolled" : "unset"

  const fromString = (s: string): boolean | null =>
    s === "enrolled" ? true : s === "not-enrolled" ? false : null

  if (!isOwner) {
    const label =
      current === true ? "Enrolled" : current === false ? "Not enrolled" : "Not stated"
    return (
      <p className="text-sm">
        Deferred import VAT scheme: <span className="font-medium">{label}</span>. Only the
        workspace owner can change it.
      </p>
    )
  }

  const change = (v: boolean | null) => {
    if (asString(v) === asString(current)) return
    startTransition(async () => {
      const res = await setDeferredVatSchemeAction(workspaceId, v)
      if (res.success) {
        toast.success("Setting saved")
        router.refresh()
      } else {
        toast.error(res.error || "Could not save setting")
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-slate-600">Deferred import VAT scheme</label>
      <select
        value={asString(current)}
        disabled={pending}
        onChange={(e) => change(fromString(e.target.value))}
        className="w-fit rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
      >
        <option value="unset">Not stated</option>
        <option value="enrolled">Enrolled</option>
        <option value="not-enrolled">Not enrolled</option>
      </select>
    </div>
  )
}

"use client"

import { setPoQuantityToleranceAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { useState } from "react"
import { toast } from "sonner"

export function PoQuantityTolerance({ workspaceId, percent }: { workspaceId: string; percent: number }) {
  const [value, setValue] = useState(String(percent))
  const [pending, setPending] = useState(false)

  const save = async () => {
    const parsed = Number(value)
    setPending(true)
    try {
      const result = await setPoQuantityToleranceAction(workspaceId, parsed)
      if (!result.success) { setValue(String(percent)); toast.error(result.error || "Could not change the tolerance setting"); return }
      toast.success("Tolerance updated")
    } catch {
      setValue(String(percent))
      toast.error("Could not reach the server — the tolerance setting was not changed")
    } finally { setPending(false) }
  }

  return <label className="flex items-center justify-between gap-4 rounded border p-4">
    <span><span className="block font-medium">Acceptable quantity tolerance</span><span className="text-sm text-muted-foreground">How far a PO&apos;s cumulative invoiced quantity can exceed what was ordered before the consumption check flags it.</span></span>
    <span className="flex items-center gap-1">
      <input aria-label="Acceptable quantity tolerance percent" type="number" min={0} max={100} step={1} className="w-20 rounded border px-2 py-1 text-right" value={value} disabled={pending} onChange={(event) => setValue(event.target.value)} onBlur={() => void save()} />
      <span className="text-sm text-muted-foreground">%</span>
    </span>
  </label>
}

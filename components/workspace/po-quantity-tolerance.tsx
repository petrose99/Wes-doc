"use client"

import { setPoQuantityToleranceAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { AdminSaveBar } from "@/components/admin/admin-save-bar"
import { Input } from "@/components/ui/input"
import { useCallback, useId, useState } from "react"

/** #252: the PO quantity tolerance on Admin › PO Mismatch Flows › Tolerances. One number, but
 * the same Save + Discard bar as every other Admin form (critique H4): nothing applies on blur,
 * a refusal stays beside the field, the form keeps the typed value. */
export function PoQuantityTolerance({ workspaceId, percent, readOnly = false }: { workspaceId: string; percent: number; readOnly?: boolean }) {
  const id = useId()
  const [value, setValue] = useState(String(percent))
  const [saved, setSaved] = useState(percent)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const parsed = Number(value)
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
  const dirty = valid ? parsed !== saved : value !== String(saved)

  const save = async () => {
    if (!valid) return
    setPending(true); setError(null)
    try {
      const result = await setPoQuantityToleranceAction(workspaceId, parsed)
      if (!result.success) { setError(`Couldn't save — ${result.error || "the server didn't say why"}. Your change is still here.`); return }
      setSaved(parsed); setSavedAt(Date.now())
    } catch {
      setError("Couldn't reach the server. Your change is still here.")
    } finally { setPending(false) }
  }
  const discard = () => { setValue(String(saved)); setError(null) }
  const clearSaved = useCallback(() => setSavedAt(null), [])

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
      <div className="max-w-[56ch]">
        <label htmlFor={id} className="block text-sm text-slate-900">Quantity tolerance</label>
        <p className="mt-0.5 max-w-[52ch] text-xs leading-relaxed text-slate-500">How far a purchase order&rsquo;s cumulative invoiced quantity may exceed what was ordered before the line shows ≠ and the consumption check holds the invoice.</p>
      </div>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" min={0} max={100} step={1} inputMode="numeric" className="w-20 text-right tabular-nums" value={value}
          disabled={pending || readOnly} aria-invalid={!valid || undefined} onChange={(event) => setValue(event.target.value)} />
        <span className="text-sm text-slate-600">%</span>
      </div>
    </div>
    <AdminSaveBar dirty={dirty} pending={pending} error={error} savedAt={savedAt} disabled={readOnly}
      blocker={valid ? null : "Enter a whole number between 0 and 100."}
      onSave={() => void save()} onDiscard={discard} onSavedShown={clearSaved} />
  </div>
}

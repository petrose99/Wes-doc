import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
let p, s
const load = (f) => { p = `${root}/${f}`; s = readFileSync(p, 'utf8') }
const save = () => writeFileSync(p, s)
const rep = (a, b) => { if (!s.includes(a)) throw new Error(`missing in ${p}: ` + a.slice(0, 80)); s = s.replace(a, b) }

// Jurisdiction picker: a real placeholder so the first country never reads as chosen.
load('components/workspace/jurisdiction-picker.tsx')
rep(`  const [selected, setSelected] = useState<JurisdictionCode | null>(current?.code ?? options[0]?.code ?? null)`, `  const [selected, setSelected] = useState<JurisdictionCode | null>(current?.code ?? null)`)
rep(`        onChange={(event) => setSelected(event.target.value as JurisdictionCode)}
      >
        {options.map(`, `        onChange={(event) => setSelected((event.target.value || null) as JurisdictionCode | null)}
      >
        <option value="">Choose a jurisdiction…</option>
        {options.map(`)
rep(`className="rounded-md border px-3 py-2 text-sm"`, `className="h-9 rounded-md border border-input bg-white px-3 text-sm"`)
rep(`<p className="text-sm text-slate-600">No jurisdiction packs are registered yet. Ship a pack under <code>lib/jurisdictions/&lt;code&gt;/</code> to unlock this picker.</p>`, `<p className="text-sm text-slate-600">No jurisdiction packs are available on this deployment yet.</p>`)
save()

// Sign out everywhere: a confirm before every session on the account ends.
load('components/auth/sign-out-everywhere-button.tsx')
rep(`import { useState } from "react"
import { toast } from "sonner"`, `import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"`)
rep(`export function SignOutEverywhereButton() {
  const [busy, setBusy] = useState(false)
  return <button
    type="button"
    className="rounded-md border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    disabled={busy}
    onClick={async () => {
      setBusy(true)`, `export function SignOutEverywhereButton() {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const signOutEverywhere = async () => {
      setBusy(true)`)
save()
// The tail of the component: close the handler and render button + confirm.
load('components/auth/sign-out-everywhere-button.tsx')
{
  const tailStart = s.indexOf('      } catch {\n        toast.error("Could not reach the server")')
  const tail = s.slice(tailStart)
  const newTail = `      } catch {
        toast.error("Couldn't reach the server")
        setBusy(false)
      }
  }
  return <>
    <button
      type="button"
      className="inline-flex min-h-11 items-center rounded-md border border-hairline px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
      disabled={busy}
      onClick={() => setConfirming(true)}
    >
      {busy ? "Signing out…" : "Sign out everywhere"}
    </button>
    <ConfirmDialog
      open={confirming}
      busy={busy}
      title="Sign out of every session?"
      description="Every browser and phone signed in to your account is signed out, this one included. You will need to sign in again."
      confirmLabel={busy ? "Signing out…" : "Sign out everywhere"}
      onConfirm={() => void signOutEverywhere()}
      onCancel={() => setConfirming(false)}
    />
  </>
}
`
  s = s.slice(0, tailStart) + newTail
}
save()

// PO tolerance: the shared save bar instead of blur-autosave + toast.
load('components/workspace/po-quantity-tolerance.tsx')
s = `"use client"

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
      if (!result.success) { setError(\`Couldn't save — \${result.error || "the server didn't say why"}. Your change is still here.\`); return }
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
`
save()
console.log('ok')

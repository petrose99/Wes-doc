"use client"

import { setDeferredVatSchemeAction, setJurisdictionAction } from "@/app/(app)/workspaces/[workspaceId]/jurisdiction-actions"
import { AdminSaveBar } from "@/components/admin/admin-save-bar"
import { upsertCategoryNatureAction } from "@/app/(app)/workspaces/[workspaceId]/(chrome)/settings/categories/actions"
import { Panel } from "@/components/automation/automation-ui"
import { CategoryNatureTable } from "@/components/settings/category-nature-table"
import type { CategoryNature, CategoryNatureRow } from "@/models/category-natures"
import type { JurisdictionCode } from "@/lib/jurisdictions"
import { useRouter } from "next/navigation"
import { useCallback, useId, useState, useTransition, type ReactNode } from "react"

export type JurisdictionOption = { code: JurisdictionCode; name: string; packVersion: string }
type Scheme = "unset" | "enrolled" | "not-enrolled"

const schemeOf = (v: boolean | null): Scheme => (v === true ? "enrolled" : v === false ? "not-enrolled" : "unset")
const schemeValue = (s: Scheme): boolean | null => (s === "enrolled" ? true : s === "not-enrolled" ? false : null)

/** #252 (evaluate H4, P1): Tax used to carry three save grammars on one page — an inline Save
 * for the jurisdiction (#49), an on-change autosave for the deferred VAT scheme (#84) and the
 * Admin save bar for everything else. An owner who had learned "nothing applies until Save
 * changes" changed the VAT select and it was already in force, with no Discard and no leave
 * guard. Both facts now sit in one form behind the one sticky bar: the page's only Save. */
export function TaxForm({ workspaceId, options, jurisdiction, deferredVatScheme, jurisdictionFacts, natures, owner }: {
  workspaceId: string
  options: JurisdictionOption[]
  jurisdiction: { code: JurisdictionCode; packVersion: string | null } | null
  deferredVatScheme: boolean | null
  /** The read-only facts the current pack sets (currency, registration format, rates). */
  jurisdictionFacts?: ReactNode
  natures: CategoryNatureRow[]
  owner: boolean
}) {
  const router = useRouter()
  const ids = { jurisdiction: useId(), scheme: useId() }
  const [pending, startTransition] = useTransition()
  const [code, setCode] = useState<JurisdictionCode | "">(jurisdiction?.code ?? "")
  const [scheme, setScheme] = useState<Scheme>(schemeOf(deferredVatScheme))
  const [natureEdits, setNatureEdits] = useState<Record<string, CategoryNature>>({})
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const savedCode = jurisdiction?.code ?? ""
  const savedScheme = schemeOf(deferredVatScheme)
  const changedNatures = natures.filter((row) => natureEdits[row.id] !== undefined && natureEdits[row.id] !== row.nature)
  const dirty = code !== savedCode || scheme !== savedScheme || changedNatures.length > 0
  // A set jurisdiction cannot be cleared (intake would stop); the scheme and natures save on their own.
  const blocker = dirty && code === "" && savedCode !== "" ? "Choose a jurisdiction — a company cannot go back to none." : null
  const currentName = options.find((o) => o.code === jurisdiction?.code)?.name ?? jurisdiction?.code

  const save = useCallback(() => {
    if (!dirty || blocker) return
    setError(null)
    startTransition(async () => {
      if (code !== savedCode && code !== "") {
        const result = await setJurisdictionAction(workspaceId, code)
        if (!result.success) { setError(result.error ? `Couldn't save the jurisdiction — ${result.error} Your changes are still here.` : "Couldn't save the jurisdiction — the server didn't say why. Your changes are still here."); return }
      }
      if (scheme !== savedScheme) {
        const result = await setDeferredVatSchemeAction(workspaceId, schemeValue(scheme))
        // A step that fails after an earlier one saved: refresh so the saved fact stops reading as dirty.
        if (!result.success) { setError(result.error ? `Couldn't save the VAT scheme — ${result.error} The jurisdiction saved; the scheme is still here.` : "Couldn't save the VAT scheme — the server didn't say why. The jurisdiction saved; the scheme is still here."); router.refresh(); return }
      }
      for (const row of changedNatures) {
        const result = await upsertCategoryNatureAction(workspaceId, row.category, natureEdits[row.id])
        if (!result.success) { setError(result.error ? `Couldn't save ${row.category} — ${result.error} Earlier changes saved; this one is still here.` : `Couldn't save ${row.category} — the server didn't say why. Earlier changes saved; this one is still here.`); router.refresh(); return }
      }
      setNatureEdits({})
      setSavedAt(Date.now())
      router.refresh()
    })
  }, [dirty, blocker, code, savedCode, scheme, savedScheme, changedNatures, natureEdits, workspaceId, router])

  const discard = () => { setCode(savedCode); setScheme(savedScheme); setNatureEdits({}); setError(null) }

  return <>
    <Panel title="Tax jurisdiction" note="The rule pack loads live; rates are snapshotted, so a document already checked keeps the rates in force when it was checked.">
      {!jurisdiction && owner && <div className="mb-3 max-w-[60ch] rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
        <p className="font-medium">Jurisdiction required</p>
        <p>Email intake and uploads are refused until a jurisdiction is picked.</p>
      </div>}
      {owner
        ? <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.jurisdiction} className="text-xs font-medium text-slate-600">Jurisdiction</label>
          <select id={ids.jurisdiction} value={code} disabled={pending || options.length === 0} onChange={(event) => setCode(event.target.value as JurisdictionCode | "")} className="h-9 w-fit rounded-md border border-input bg-white px-3 text-sm">
            <option value="">Choose a jurisdiction…</option>
            {options.map((option) => <option key={option.code} value={option.code}>{option.name} ({option.code})</option>)}
          </select>
          {jurisdiction?.packVersion && <p className="text-xs text-slate-600">Rule pack {jurisdiction.packVersion}</p>}
          {options.length === 0 && <p className="text-sm text-slate-600">No jurisdiction packs are available on this deployment yet.</p>}
        </div>
        : jurisdiction
          ? <p className="text-sm text-slate-900">Jurisdiction is <span className="font-medium">{currentName}</span>.</p>
          : <p className="text-sm text-slate-600">No jurisdiction set yet.</p>}
      {jurisdictionFacts}
    </Panel>

    <Panel title="Deferred import VAT scheme" note="Applies where a jurisdiction lets you defer import VAT to the return instead of paying at the border (Lesotho's VAT-12 splits import inputs by it). Leave it Not stated if it does not apply: imports then pass the return-form columns untouched.">
      {owner
        ? <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.scheme} className="text-xs font-medium text-slate-600">Deferred import VAT scheme</label>
          <select id={ids.scheme} value={scheme} disabled={pending} onChange={(event) => setScheme(event.target.value as Scheme)} className="h-9 w-fit rounded-md border border-input bg-white px-3 text-sm">
            <option value="unset">Not stated</option>
            <option value="enrolled">Enrolled</option>
            <option value="not-enrolled">Not enrolled</option>
          </select>
        </div>
        : <p className="text-sm text-slate-900">Deferred import VAT scheme: <span className="font-medium">{savedScheme === "enrolled" ? "Enrolled" : savedScheme === "not-enrolled" ? "Not enrolled" : "Not stated"}</span>.</p>}
    </Panel>

    <Panel title="Goods or services, by category" note="Return-form workpapers that split inputs by goods and services (Lesotho VAT-12) read this. A category with no row is unset and passes those columns; packs that do not split (ZA VAT201, GB VAT return) ignore it.">
      <CategoryNatureTable workspaceId={workspaceId} rows={natures} isOwner={owner} natureOverrides={natureEdits} onNatureChange={(id, _category, nature) => setNatureEdits((edits) => ({ ...edits, [id]: nature }))} />
    </Panel>

    <AdminSaveBar dirty={dirty} pending={pending} error={error} savedAt={savedAt} blocker={blocker} onSave={save} onDiscard={discard} onSavedShown={() => setSavedAt(null)} disabled={!owner} />
  </>
}

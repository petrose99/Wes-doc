// #252: AutomationConfigForm → Admin › Configuration › Autonomy. Read-only mode for members,
// the shared sticky save bar, Policy folded into "What blocks a publish", Required consequence.
import { readFileSync, writeFileSync } from 'node:fs'
const p = '/home/ubuntu/Dev/Wes-doc/components/settings/automation-config-form.tsx'
let s = readFileSync(p, 'utf8')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 60)); s = s.replace(a, b) }

rep(`import { Panel } from "@/components/automation/automation-ui"
import { Button } from "@/components/ui/button"`, `import { AdminSaveBar } from "@/components/admin/admin-save-bar"
import { Panel } from "@/components/automation/automation-ui"`)
rep(`import { useEffect, useId, useState } from "react"`, `import { useId, useState } from "react"`)

rep(`function AmountBandRow({ band, onChange, onRemove }: {
  band: { min: number; max: number | null; minConfidence: number; requireVerifiedSupplier?: boolean }
  onChange: (patch: Partial<typeof band>) => void
  onRemove: () => void
}) {`, `function AmountBandRow({ band, onChange, onRemove, readOnly = false }: {
  band: { min: number; max: number | null; minConfidence: number; requireVerifiedSupplier?: boolean }
  onChange: (patch: Partial<typeof band>) => void
  onRemove: () => void
  readOnly?: boolean
}) {`)
// disable band inputs in read-only
s = s.replace(/<Input id=\{minId\} type="number" min=\{0\} step="0.01" value=\{band.min\}/, '<Input id={minId} type="number" min={0} step="0.01" value={band.min} disabled={readOnly}')
rep(`          id={maxId}
          type="number"`, `          id={maxId}
          disabled={readOnly}
          type="number"`)
rep(`        checked={band.requireVerifiedSupplier ?? false}
        onChange=`, `        checked={band.requireVerifiedSupplier ?? false}
        disabled={readOnly}
        onChange=`)
rep(`      <button type="button" onClick={onRemove} className="pb-2.5 text-[13px] font-medium text-red-700 hover:underline">
        Remove
      </button>`, `      {!readOnly && <button type="button" onClick={onRemove} className="pb-2.5 text-[13px] font-medium text-red-700 hover:underline">
        Remove
      </button>}`)

rep(`export function AutomationConfigForm({ workspaceId, initial }: { workspaceId: string; initial: AutomationConfigInitial }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)`, `/** \`readOnly\` (#231 Q19): a member sees the form with every control disabled and no save bar —
 * the page above it names an owner to ask. */
export function AutomationConfigForm({ workspaceId, initial, readOnly = false }: { workspaceId: string; initial: AutomationConfigInitial; readOnly?: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)`)

rep(`  const dirty = currentSnapshot !== savedSnapshot

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])
`, `  const dirty = currentSnapshot !== savedSnapshot

  const discard = () => {
    setLevel(initial.level); setMinConfidence(initial.minConfidence); setQaSampleRate(initial.qaSampleRate)
    setRequirePolicyPass(initial.requirePolicyPass); setBlockOnWarnChecks(initial.blockOnWarnChecks)
    setPolicyText(initial.policyText ?? ""); setAmountBands(initial.amountBands); setSaveError(null)
  }
`)

rep(`  const persist = async () => {
    setPending(true)
    try {`, `  const persist = async () => {
    setPending(true)
    setSaveError(null)
    try {`)
rep(`      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Controls settings saved")
        setSavedSnapshot(currentSnapshot)
        router.refresh()
      }`, `      if ("error" in result) {
        setSaveError(\`Couldn't save — \${result.error} Your changes are still here.\`)
      } else {
        setSavedSnapshot(currentSnapshot)
        setSavedAt(Date.now())
        router.refresh()
      }`)
rep(`  const submit = async () => {
    if (bandsInvalid) {
      toast.error("Fix the confidence-by-amount bands before saving — \\"Up to\\" must be at least \\"From\\".")
      return
    }`, `  const submit = async () => {
    if (bandsInvalid) return`)

// Ladder radios disabled in read-only
rep(`                  checked={selected}
                  onChange={() => setLevel(option.value)}`, `                  checked={selected}
                  disabled={readOnly}
                  onChange={() => setLevel(option.value)}`)
rep(`              className={\`group relative cursor-pointer p-4`, `              className={\`group relative \${readOnly ? "" : "cursor-pointer"} p-4`)

// Confidence inputs
rep(`              value={minConfidence}
              onChange=`, `              value={minConfidence}
              disabled={readOnly}
              onChange=`)
rep(`              value={qaSampleRate}
              onChange=`, `              value={qaSampleRate}
              disabled={readOnly}
              onChange=`)

// What blocks a publish: toggles disabled, Policy folded in, Required consequence
rep(`          <SettingToggle
            id="requirePolicyPass"
            label="The policy check has to pass"
            explanation="A document the policy rejects, or that the check could not evaluate, goes to a person."
            checked={requirePolicyPass}
            onChange={setRequirePolicyPass}
          />
          <SettingToggle
            id="blockOnWarnChecks"
            label="Any warning stops it, not just a failure"
            explanation="Stricter: arithmetic and duplicate warnings hold the document back too."
            checked={blockOnWarnChecks}
            onChange={setBlockOnWarnChecks}
          />
        </div>
      </Panel>

      <Panel title="Policy" note="Written in plain language and checked against every document before it publishes.">
        <Label htmlFor="policyText" className="sr-only">Policy</Label>
        <Textarea
          id="policyText"
          rows={4}
          value={policyText}
          onChange={(e) => setPolicyText(e.target.value)}
          placeholder="Expenses over $1,000 need a receipt attached."
        />
        <p className="mt-1.5 text-xs text-slate-500">Leave this empty and no policy check runs.</p>
      </Panel>`, `          <SettingToggle
            id="requirePolicyPass"
            label="The policy check has to pass"
            explanation="A document the policy rejects, or that the check could not evaluate, goes to a person."
            checked={requirePolicyPass}
            onChange={setRequirePolicyPass}
            disabled={readOnly}
          />
          <div className="py-3">
            <Label htmlFor="policyText" className="text-sm text-slate-900">The policy, in plain language</Label>
            <Textarea
              id="policyText"
              rows={3}
              value={policyText}
              disabled={readOnly}
              onChange={(e) => setPolicyText(e.target.value)}
              placeholder="Expenses over R 10 000 need a receipt attached."
              className="mt-1.5"
            />
            <p className="mt-1.5 text-xs text-slate-500">Checked against every document before it publishes. Leave it empty and no policy check runs.</p>
          </div>
          <SettingToggle
            id="blockOnWarnChecks"
            label="Any warning stops it, not just a failure"
            explanation="Stricter: arithmetic and duplicate warnings hold the document back too."
            checked={blockOnWarnChecks}
            onChange={setBlockOnWarnChecks}
            disabled={readOnly}
          />
          <p className="pt-3 text-[13px] leading-relaxed text-slate-600">
            A required field with no value also holds a document in review. Which fields are required is set under{" "}
            <a href={\`/workspaces/\${workspaceId}/admin/configuration\`} className="font-medium text-emerald-700 underline-offset-2 hover:underline">Fields</a>.
          </p>
        </div>
      </Panel>`)

// Bands: pass readOnly, hide add buttons
rep(`              <button type="button" onClick={addBand} className="mt-2 text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
                Add a band
              </button>
            </div>`, `              {!readOnly && <button type="button" onClick={addBand} className="mt-2 text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
                Add a band
              </button>}
            </div>`)
rep(`                <AmountBandRow key={i} band={band} onChange={(patch) => updateBand(i, patch)} onRemove={() => removeBand(i)} />
              ))}
              <button type="button" onClick={addBand} className="text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
                Add a band
              </button>`, `                <AmountBandRow key={i} band={band} onChange={(patch) => updateBand(i, patch)} onRemove={() => removeBand(i)} readOnly={readOnly} />
              ))}
              {!readOnly && <button type="button" onClick={addBand} className="text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
                Add a band
              </button>}`)

// Bottom save block → AdminSaveBar
rep(`    <div className="flex items-center gap-3 border-t border-hairline pt-5">
      <Button onClick={() => void submit()} disabled={pending || bandsInvalid}>{pending ? "Saving" : "Save changes"}</Button>
      {dirty && !pending && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
        Unsaved changes
      </span>}
      {bandsInvalid && <p className="text-xs text-red-600">Fix the confidence-by-amount bands above before saving.</p>}
    </div>
`, `    <AdminSaveBar dirty={dirty} pending={pending} error={saveError} savedAt={savedAt} disabled={readOnly}
      blocker={bandsInvalid ? "Fix the confidence-by-amount bands above before saving." : null}
      onSave={() => void submit()} onDiscard={discard} />
`)

// toast import may now be unused
if (!/toast\./.test(s.replace('import { toast } from "sonner"', ''))) s = s.replace('import { toast } from "sonner"\n', '')
writeFileSync(p, s)
console.log('ok')

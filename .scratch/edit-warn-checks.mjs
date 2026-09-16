// #252 / #231 Q25: Checks page words — Predicate → When, Reference → Fields you can test,
// no source paths; h2s become Panels (the admin grammar); readOnly for members.
import { readFileSync, writeFileSync } from 'node:fs'
const p = '/home/ubuntu/Dev/Wes-doc/components/settings/warn-checks-admin.tsx'
let s = readFileSync(p, 'utf8')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b) }

rep(`export function WarnChecksAdmin({
  workspaceId,
  initial,
}: {
  workspaceId: string
  initial: WarnCheckRow[]
}) {`, `export function WarnChecksAdmin({
  workspaceId,
  initial,
  readOnly = false,
}: {
  workspaceId: string
  initial: WarnCheckRow[]
  /** #231 Q19: a member sees the checks and cannot change them. */
  readOnly?: boolean
}) {`)
rep(`        <h2 className="font-display text-lg font-semibold text-slate-900">Rules</h2>`, `        <h2 className="border-b border-hairline pb-2.5 text-[15px] font-semibold text-slate-900">Your checks</h2>`)
rep(`      <section>
        <h2 className="font-display text-lg font-semibold text-slate-900">Add a warn check</h2>
        <p className="mt-2 max-w-[64ch] text-sm text-slate-600">
          Predicates use a small expression language over the fields below. The dry-run tries
          the rule against the last 20 invoices so you can see what would have fired before
          turning it on.
        </p>
        <div className="mt-4">
          <WarnCheckForm workspaceId={workspaceId} mode="create" onSaved={refresh} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-slate-900">Reference</h2>
        <p className="mt-2 max-w-[64ch] text-sm text-slate-600">
          Variables (available in every rule):
        </p>`, `      {!readOnly && <section>
        <h2 className="border-b border-hairline pb-2.5 text-[15px] font-semibold text-slate-900">Add a check</h2>
        <p className="mt-3 max-w-[64ch] text-[13px] leading-relaxed text-slate-600">
          When is a short condition over the fields listed under it. Try it first: the dry run
          shows which of the last 20 invoices would have been held, before the check is on.
        </p>
        <div className="mt-4">
          <WarnCheckForm workspaceId={workspaceId} mode="create" onSaved={refresh} />
        </div>
      </section>}

      <section>
        <h2 className="border-b border-hairline pb-2.5 text-[15px] font-semibold text-slate-900">Fields you can test</h2>
        <p className="mt-3 max-w-[64ch] text-[13px] leading-relaxed text-slate-600">
          Every check can use these fields:
        </p>`)
rep(`          <code className="font-mono">false</code>, and parentheses. No arithmetic, no regex, no
          arbitrary code — a rule that needs it belongs alongside the built-in gates in
          <code className="font-mono">lib/gates/</code>.
        </p>`, `          <code className="font-mono">false</code>, and parentheses. No arithmetic and no
          patterns — a rule that needs more than this is a built-in check, not a warn check.
        </p>`)
rep(`        <Label htmlFor={\`\${mode}-when\`} className="text-sm">Predicate</Label>`, `        <Label htmlFor={\`\${mode}-when\`} className="text-sm">When</Label>`)
writeFileSync(p, s)
console.log('ok')

// #252 fix batch A: measures (ch caps read ~87–136 chars at 13–14px Inter → cap at 60ch/62ch),
// tablist inset, approval form 11px text, detector mouse position.
import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
let p, s
const load = (f) => { p = `${root}/${f}`; s = readFileSync(p, 'utf8') }
const save = () => writeFileSync(p, s)
const rep = (a, b, all = false) => { if (!s.includes(a)) throw new Error(`missing in ${p}: ` + a.slice(0, 70)); s = all ? s.split(a).join(b) : s.replace(a, b) }

load('components/admin/admin-ui.tsx')
rep(`{intro && <p className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-slate-600">{intro}</p>}`, `{intro && <p className="mt-2.5 max-w-[60ch] text-sm leading-relaxed text-slate-600">{intro}</p>}`)
rep(`return <p className="max-w-[68ch] text-[13px] leading-relaxed text-slate-600">{children}</p>`, `return <p className="max-w-[60ch] text-[13px] leading-relaxed text-slate-600">{children}</p>`)
save()

load('components/admin/doc-type-switcher.tsx')
rep(`className="inline-flex rounded-md border border-hairline bg-slate-50 p-0.5"`, `className="inline-flex rounded-md border border-hairline bg-slate-50 p-1"`)
save()

load('components/automation/automation-ui.tsx')
rep(`{note && <p className="mt-1 max-w-[72ch] text-[13px] leading-relaxed text-slate-500">{note}</p>}`, `{note && <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-slate-500">{note}</p>}`)
save()

load('components/admin/panel-card.tsx')
rep(`mt-1 max-w-[72ch] text-[13px]`, `mt-1 max-w-[62ch] text-[13px]`)
save()

load('components/settings/automation-config-form.tsx')
rep(`<p className="rounded-md border border-dashed border-hairline-dashed px-4 py-3 text-[13px] text-slate-600">`, `<p className="max-w-[60ch] rounded-md border border-dashed border-hairline-dashed px-4 py-3 text-[13px] leading-relaxed text-slate-600">`)
rep(`<p className="mt-1.5 text-xs text-slate-500">Checked against every document before it publishes. Leave it empty and no policy check runs.</p>`, `<p className="mt-1.5 max-w-[60ch] text-xs text-slate-500">Checked against every document before it publishes. Leave it empty and no policy check runs.</p>`)
rep(`<p className="pt-3 text-[13px] leading-relaxed text-slate-600">`, `<p className="max-w-[60ch] pt-3 text-[13px] leading-relaxed text-slate-600">`)
rep(`<p className="mt-1.5 text-xs text-slate-500">
              How much of the published work is spot-checked anyway.`, `<p className="mt-1.5 max-w-[48ch] text-xs text-slate-500">
              How much of the published work is spot-checked anyway.`)
save()

load('components/workspace/module-row.tsx')
rep(`<p className="text-[13px] text-slate-600">{description}</p>`, `<p className="max-w-[60ch] text-[13px] text-slate-600">{description}</p>`)
save()

load('components/workspace/po-quantity-tolerance.tsx')
rep(`<p className="mt-0.5 text-xs leading-relaxed text-slate-500">`, `<p className="mt-0.5 max-w-[52ch] text-xs leading-relaxed text-slate-500">`)
rep(`<div className="max-w-[52ch]">`, `<div className="max-w-[56ch]">`)
save()

load('app/(app)/workspaces/[workspaceId]/admin/companies/page.tsx')
rep(`<p className="mt-4 text-xs text-slate-600">Your personal workspace`, `<p className="mt-4 max-w-[60ch] text-xs text-slate-600">Your personal workspace`)
save()

load('components/workspace/approval-workflow-form.tsx')
rep(`className="mt-1.5 text-[11px] text-slate-500"`, `className="mt-1.5 max-w-[48ch] text-xs text-slate-500"`)
rep(`<p className="mt-1 text-[11px] text-slate-500">Skip this stage below this amount. Blank = always applies.</p>`, `<p className="mt-1 text-xs text-slate-500">Skip this stage below this amount. Blank = always applies.</p>`)
rep(`<p className="mt-1 text-xs text-slate-400">No workspace members to name yet.</p>`, `<p className="mt-1 text-xs text-slate-600">No workspace members to name yet.</p>`)
rep(`<span className="text-xs text-slate-400">No member matches`, `<span className="text-xs text-slate-600">No member matches`)
save()

load('.impeccable/live/admin252.mjs')
rep(`async function detect(page) {
  await page.addScriptTag`, `async function detect(page) {
  // The collapsed rail expands under a hover; headless Chromium parks the mouse at (0,0), which
  // is the rail. Park it over the page body so the detector sees the resting state.
  await page.mouse.move(900, 500)
  await page.waitForTimeout(250)
  await page.addScriptTag`)
save()
console.log('ok')

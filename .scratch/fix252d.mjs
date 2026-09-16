// #252 fix batch D (after the confirming critique, 30/40): aim at four 4s.
import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
let p, s
const load = (f) => { p = `${root}/${f}`; s = readFileSync(p, 'utf8') }
const save = () => writeFileSync(p, s)
const rep = (a, b) => { if (!s.includes(a)) throw new Error(`missing in ${p}: ` + a.slice(0, 80)); s = s.replace(a, b) }

// H2: hints in the owner's words, not the extraction schema's.
load('lib/configuration/field-table.ts')
rep(`const HINT_OVERRIDES: Record<string, string> = {
  vendor: "Name of the supplier",
}`, `const HINT_OVERRIDES: Record<string, string> = {
  vendor: "Name of the supplier",
  issue_date: "Date the invoice was issued",
  due_date: "Payment due date",
  purchase_date: "Date of purchase",
  order_date: "Order date",
  delivery_date: "Expected delivery date",
  statement_period_start: "First day of the statement period",
  statement_period_end: "Last day of the statement period",
  currency_code: "Currency of the amounts, as a three-letter code",
  other_charges: "Any other charges, each with a description and an amount",
  line_items: "The lines: description, quantity, unit price, amount",
  transactions: "The statement lines: date, description, amount, balance",
  accounts: "Accounts on the statement, with opening and closing balances",
  account_number: "Account number, masked if the statement masks it",
  payment_terms: "Payment terms, for example Net 30",
  supplier_vat_number: "The supplier's VAT or tax number",
  payment_iban: "IBAN the invoice asks to be paid to",
  po_number: "Purchase order reference, if any",
}`)
save()

// H5 (prevention) + decision recorded: Required ⇒ Editable. A required field that cannot be
// edited would hold a document nobody can free; the safe default is the rule, the alternative goes on a ticket.
load('components/admin/field-table-editor.tsx')
rep(`  const update = (key: string, patch: Partial<EditableRow>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))`,
    `  // Required ⇒ Editable: a required field a reviewer cannot fill would hold a document in review
  // that nobody can free. Ticking Required turns Editable on; Editable stays on while Required is.
  const update = (key: string, patch: Partial<EditableRow>) => setRows((current) => current.map((row) => {
    if (row.key !== key) return row
    const next = { ...row, ...patch }
    if (next.required) next.editable = true
    return next
  }))`)
rep(`                <input id={editableId} type="checkbox" className="h-4 w-4 accent-emerald-700" checked={row.editable} disabled={readOnly}
                  aria-label={\`\${row.label} editable\`} onChange={(event) => update(row.key, { editable: event.target.checked })} />`,
    `                <input id={editableId} type="checkbox" className="h-4 w-4 accent-emerald-700" checked={row.editable} disabled={readOnly || row.required}
                  aria-label={row.required ? \`\${row.label} editable — stays on while the field is required\` : \`\${row.label} editable\`} onChange={(event) => update(row.key, { editable: event.target.checked })} />`)
rep(`            <th scope="col" className="pb-2 text-right text-[13px] font-medium text-slate-500">Order</th>`, `            <th scope="col" className="w-16 whitespace-nowrap pb-2 text-right text-[13px] font-medium text-slate-500 md:w-20">Order</th>`)
save()
// The lib rule too, so a stored row can never say required && !editable.
load('lib/configuration/field-table.ts')
rep(`      custom: false,
      editable: stored?.editable ?? true,
      required: requiredLocked || (stored?.required ?? defaults[field.key]?.required ?? false),`, `      custom: false,
      // Required ⇒ Editable (the pane must be able to fill what it demands).
      editable: (stored?.editable ?? true) || requiredLocked || (stored?.required ?? false),
      required: requiredLocked || (stored?.required ?? defaults[field.key]?.required ?? false),`)
rep(`      custom: true,
      editable: stored?.editable ?? true,
      required: stored?.required ?? field.required ?? false,`, `      custom: true,
      editable: (stored?.editable ?? true) || (stored?.required ?? field.required ?? false),
      required: stored?.required ?? field.required ?? false,`)
save()
load('app/(app)/workspaces/[workspaceId]/admin/configuration/actions.ts')
rep(`    rows.push({ key: row.key, editable: row.editable === true, required: locked.has(row.key) || row.required === true, width: row.width })`, `    const required = locked.has(row.key) || row.required === true
    // Required ⇒ Editable, enforced on the way in as well as in the editor.
    rows.push({ key: row.key, editable: row.editable === true || required, required, width: row.width })`)
save()
load('lib/configuration/field-table.test.ts')
rep(`  it("keeps the fields checks read required even when the overlay says otherwise", () => {
    const table = resolveFieldTable("invoice", [], [{ fieldKey: "total", editable: false, required: false, width: "wide", position: 0 }])
    const total = table.rows.find((row) => row.key === "total")!
    expect(total).toMatchObject({ required: true, requiredLocked: true, editable: false, width: "wide", position: 0 })`, `  it("keeps the fields checks read required even when the overlay says otherwise, and required implies editable", () => {
    const table = resolveFieldTable("invoice", [], [{ fieldKey: "total", editable: false, required: false, width: "wide", position: 0 }, { fieldKey: "due_date", editable: false, required: false, width: "normal", position: 1 }])
    const total = table.rows.find((row) => row.key === "total")!
    expect(total).toMatchObject({ required: true, requiredLocked: true, editable: true, width: "wide", position: 0 })
    expect(table.rows.find((row) => row.key === "due_date")).toMatchObject({ required: false, editable: false })`)
save()

// H3: the Back button is guarded too — a sentinel history entry while dirty.
load('lib/client/unsaved-changes.ts')
rep(`const reasons = new Map<string, string>()`, `const reasons = new Map<string, string>()
const listeners = new Set<(dirty: boolean) => void>()

/** Subscribe to "is anything unsaved" changing — the Admin leave guard uses it to hold a
 * history entry while a form is dirty so the Back button asks too. */
export function subscribeUnsaved(listener: (dirty: boolean) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}`)
rep(`  if (!had && has) window.addEventListener("beforeunload", onBeforeUnload)
  if (had && !has) window.removeEventListener("beforeunload", onBeforeUnload)
}`, `  if (!had && has) window.addEventListener("beforeunload", onBeforeUnload)
  if (had && !has) window.removeEventListener("beforeunload", onBeforeUnload)
  if (had !== has) for (const listener of listeners) listener(has)
}`)
save()
load('components/admin/admin-leave-guard.tsx')
s = `"use client"

import { useEffect } from "react"
import { confirmLeave, subscribeUnsaved } from "@/lib/client/unsaved-changes"

/** #252 (critique H3, P0): \`beforeunload\` only guards a reload or a closed tab. Every link in the
 * app — the rail, the Admin nav, the document-type tabs — is a client navigation, which would
 * drop a dirty form without a word. This listens at the capture phase for any same-origin link
 * click while something is registered unsaved (lib/client/unsaved-changes) and asks first, the
 * same question the Queue screen asks before it swaps the Detail pane.
 *
 * The Back button is guarded the same way: while a form is dirty a sentinel history entry is
 * pushed, so the first Back lands on the same page and asks; declining re-arms the sentinel,
 * leaving goes back for real. */
const SENTINEL = "docubite-unsaved-sentinel"

export function AdminLeaveGuard() {
  useEffect(() => {
    let armed = false
    const arm = () => { if (armed) return; window.history.pushState({ [SENTINEL]: true }, "", window.location.href); armed = true }
    const disarm = () => { if (!armed) return; armed = false; if (window.history.state?.[SENTINEL]) window.history.back() }
    const unsubscribe = subscribeUnsaved((dirty) => { if (dirty) arm(); else disarm() })

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      if (!confirmLeave()) { event.preventDefault(); event.stopPropagation(); return }
      armed = false
    }
    const onPopState = () => {
      if (!armed) return
      // Back from the sentinel: ask; declining re-pushes the sentinel so the page stays.
      if (!confirmLeave()) { window.history.pushState({ [SENTINEL]: true }, "", window.location.href); return }
      armed = false
    }
    document.addEventListener("click", onClick, true)
    window.addEventListener("popstate", onPopState)
    return () => { unsubscribe(); document.removeEventListener("click", onClick, true); window.removeEventListener("popstate", onPopState) }
  }, [])
  return null
}
`
save()

// H7: ⌘/Ctrl+S saves a dirty form (a chord, not a single-key shortcut).
load('components/admin/admin-save-bar.tsx')
rep(`  useEffect(() => {
    if (savedAt === null || dirty || !onSavedShown) return`, `  useEffect(() => {
    if (disabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        if (dirty && !pending && !blocker) onSave()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [disabled, dirty, pending, blocker, onSave])

  useEffect(() => {
    if (savedAt === null || dirty || !onSavedShown) return`)
rep(`      <Button type="button" onClick={onSave} disabled={pending || !dirty || !!blocker}>{pending ? "Saving…" : "Save changes"}</Button>`, `      <Button type="button" onClick={onSave} disabled={pending || !dirty || !!blocker} title="⌘S / Ctrl+S">{pending ? "Saving…" : "Save changes"}</Button>`)
rep(`      <span aria-live="polite" className="contents">`, `      <span aria-live="polite" className="inline-flex items-center">`)
save()

// H1 + Sam: module switch announces its new state; the label is the name only.
load('components/workspace/module-row.tsx')
rep(`  const [pending, startTransition] = useTransition()`, `  const [pending, startTransition] = useTransition()
  const [announce, setAnnounce] = useState("")`)
rep(`      const result = next ? await enableModuleAction(workspaceId, moduleKey) : await disableModuleAction(workspaceId, moduleKey)
      if (!result.success) { setChecked(!next); toast.error(result.error || "Could not change that module") }`, `      const result = next ? await enableModuleAction(workspaceId, moduleKey) : await disableModuleAction(workspaceId, moduleKey)
      if (!result.success) { setChecked(!next); setAnnounce(\`Couldn't turn \${name} \${next ? "on" : "off"} — \${result.error || "the server didn't say why"}.\`) }
      else setAnnounce(\`\${name} is \${next ? "on" : "off"}.\`)`)
rep(`          ? <button type="button" role="switch" aria-checked={checked} aria-label={\`\${name} \${checked ? "on" : "off"}\`} disabled={pending} onClick={toggle}`, `          ? <button type="button" role="switch" aria-checked={checked} aria-label={name} aria-busy={pending || undefined} disabled={pending} onClick={toggle}`)
rep(`    <div className="shrink-0">`, `    <div className="flex shrink-0 flex-col items-end gap-1">
      <span aria-live="polite" className={\`text-xs \${announce.startsWith("Couldn't") ? "text-red-700" : "text-emerald-800"}\`}>{announce}</span>`)
s = s.replace(`import { toast } from "sonner"\n`, '')
save()

// H1: MfaEnroll says it is checking rather than rendering nothing.
load('components/auth/mfa-enroll.tsx')
rep(`  if (factors === null) return null`, `  if (factors === null) return <p className="text-sm text-slate-600" aria-live="polite">Checking your two-factor status…</p>`)
save()

// H9: members table fallback copy.
load('components/workspace/members-table.tsx')
rep(`      toast.error(result.error || "Something went wrong")`, `      toast.error(result.error ? \`Couldn't do that — \${result.error}\` : "Couldn't do that — the server didn't say why. Nothing changed.")`)
save()

// H4/H6/H2: Companies "Open" wording, phone company caption, Fields → templates link, jurisdiction pack version.
load('app/(app)/workspaces/[workspaceId]/admin/companies/page.tsx')
rep(`              {current
                ? <Link href={adminPaths(workspace.id).configuration} className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline">Configuration</Link>
                : <Link href={\`/workspaces/\${workspace.id}/invoices\`} className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline">Open</Link>}`, `              {current
                ? <span className="text-xs text-slate-600">Open now</span>
                : <Link href={adminPaths(workspace.id).configuration} className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline" aria-label={\`Open \${workspace.name}'s Admin\`}>Open</Link>}`)
save()
load('components/admin/admin-ui.tsx')
rep(`export function AdminPage({ title, intro, aside, children, phoneNote = true }: {
  title: string
  intro?: ReactNode`, `export function AdminPage({ title, intro, aside, children, phoneNote = true, company }: {
  title: string
  intro?: ReactNode
  /** The company being configured — shown above the title below \`md\`, where the nav that
   * carries it is hidden (Priya must never configure the wrong client). */
  company?: string`)
rep(`      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="font-display text-[26px] leading-none font-semibold tracking-tight text-slate-900">{title}</h1>`, `      {company && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:hidden">{company}</p>}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="font-display text-[26px] leading-none font-semibold tracking-tight text-slate-900">{title}</h1>`)
save()
load('app/(app)/workspaces/[workspaceId]/admin/configuration/page.tsx')
rep(`Custom fields come from this workspace&rsquo;s document templates.</>}`, `Custom fields come from this company&rsquo;s <Link href={adminPaths(workspaceId).whatsOn} className="font-medium text-emerald-700 underline-offset-2 hover:underline">document templates</Link>.</>}
    company={context.workspace.name}`)
rep(`import { AdminPage, ReadOnlyBand } from "@/components/admin/admin-ui"`, `import Link from "next/link"
import { AdminPage, ReadOnlyBand } from "@/components/admin/admin-ui"`)
save()
load('components/workspace/jurisdiction-picker.tsx')
rep(`{current.packVersion && <p className="text-slate-600">Pack version: <code className="rounded bg-slate-100 px-1.5 py-0.5">{current.packVersion}</code></p>}`, `{current.packVersion && <p className="text-slate-600">Rule pack {current.packVersion}</p>}`)
s = s.replace(`<div className="flex flex-wrap items-start justify-between gap-4 rounded border p-4">`, `<div className="flex flex-wrap items-start justify-between gap-4">`)
save()

// H4: What's on — hide modules whose surface is unplugged (Worksheets has no navItem; key "sheets").
load('app/(app)/workspaces/[workspaceId]/admin/configuration/whats-on/page.tsx')
rep(`const UNPLUGGED_MODULE_KEYS = new Set(["expense-approvals", "dictation"])`, `const UNPLUGGED_MODULE_KEYS = new Set(["expense-approvals", "dictation", "sheets"])`)
save()

// H8: PO Mismatch's boxed note → plain text beside the sentence.
load('app/(app)/workspaces/[workspaceId]/admin/po-mismatch-flows/page.tsx')
rep(`          <div className="rounded-md border border-hairline p-5">`, `          <div className="max-w-[52ch]">`)
save()

// H2: Checks' field types in plain words.
load('components/settings/warn-checks-admin.tsx')
rep(`              <span className="text-slate-400"> : {type}</span>`, `              <span className="text-slate-500"> — {type === "number" ? "a number" : type === "boolean" ? "yes or no" : "text"}</span>`)
save()
console.log('ok')

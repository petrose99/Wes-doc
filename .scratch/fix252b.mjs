// #252 fix batch B (after the first critique/evaluate): locked-Required regression, save-grammar
// consistency, vocabulary, a11y details, layout order, honest phone note.
import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
let p, s
const load = (f) => { p = `${root}/${f}`; s = readFileSync(p, 'utf8') }
const save = () => writeFileSync(p, s)
const rep = (a, b) => { if (!s.includes(a)) throw new Error(`missing in ${p}: ` + a.slice(0, 80)); s = s.replace(a, b) }

// 1. field-table: lock only the core check fields; Required defaults from the template.
load('lib/configuration/field-table.ts')
rep(`export type CustomFieldSource = {
  key: string
  label: string
  required?: boolean
}`, `export type CustomFieldSource = {
  key: string
  label: string
  required?: boolean
}

/** What the type's own template says about a field today — the default the table shows and
 * the pane keeps until an owner stores a row. Keyed by field key. */
export type FieldDefaults = Record<string, { required?: boolean }>`)
rep(`  /** Checks read this field (\`checkFields\`), so Required cannot be switched off. */
  requiredLocked: boolean`, `  /** Checks read this field (\`checkFields\`), so Required cannot be switched off. */
  requiredLocked: boolean
  /** An owner has stored this row; until then the pane keeps the template's own flags. */
  stored: boolean`)
rep(`/** The fields a type's checks read: supplier, number, date, total, currency and the like. A
 * reviewer may still be stopped from editing them, but they stay required — a check with no
 * value to test is a check that silently passes. */
export function lockedRequiredKeys(docType: FieldTableType): Set<string> {
  const spec = DOC_TYPE_SPECS[docType]
  const keys = new Set<string>()
  for (const value of Object.values(spec.checkFields ?? {})) if (value && value !== "line_items") keys.add(value)
  return keys
}`, `/** The fields a type's identity and arithmetic checks cannot do without — who, which, when,
 * how much, in what currency (and for a statement: which account, which period, the two
 * balances). A reviewer may still be stopped from editing them, but they stay required. The
 * optional check fields (shipping, other charges, VAT number, IBAN) are *not* locked: forcing
 * them required would hold every invoice that has none. */
const LOCKED_CHECK_FIELDS: (keyof NonNullable<DocTypeSpec["checkFields"]>)[] = [
  "supplier", "invoiceNumber", "date", "total", "currency",
  "accountNumber", "periodStart", "periodEnd", "openingBalance", "closingBalance",
]

export function lockedRequiredKeys(docType: FieldTableType): Set<string> {
  const spec = DOC_TYPE_SPECS[docType]
  const keys = new Set<string>()
  for (const name of LOCKED_CHECK_FIELDS) { const value = spec.checkFields?.[name]; if (value) keys.add(value) }
  return keys
}`)
rep(`import { DOC_TYPE_SPECS, type DocType } from "@/lib/doc-types"`, `import { DOC_TYPE_SPECS, type DocType, type DocTypeSpec } from "@/lib/doc-types"`)
rep(`export function resolveFieldTable(docType: FieldTableType, custom: CustomFieldSource[], overlay: FieldOverlay[]): FieldTable {`, `export function resolveFieldTable(docType: FieldTableType, custom: CustomFieldSource[], overlay: FieldOverlay[], defaults: FieldDefaults = {}): FieldTable {`)
rep(`      custom: false,
      editable: stored?.editable ?? true,
      required: requiredLocked || (stored?.required ?? false),
      requiredLocked,`, `      custom: false,
      editable: stored?.editable ?? true,
      required: requiredLocked || (stored?.required ?? defaults[field.key]?.required ?? false),
      requiredLocked,
      stored: !!stored,`)
rep(`      required: stored?.required ?? field.required ?? false,
      requiredLocked: false,`, `      required: stored?.required ?? field.required ?? false,
      requiredLocked: false,
      stored: !!stored,`)
rep(`  return fields.map((field) => {
    const row = byKey.get(field.key)
    if (!row) return field
    return { ...field, required: row.required, readOnly: !row.editable || undefined }
  })`, `  return fields.map((field) => {
    const row = byKey.get(field.key)
    // An unstored row changes nothing: the template's own flags stand until an owner decides.
    if (!row || !row.stored) return field
    return { ...field, required: row.required, readOnly: !row.editable || undefined }
  })`)
save()

load('models/field-configs.ts')
rep(`import {
  isFieldWidth, resolveFieldTable,
  type CustomFieldSource, type FieldOverlay, type FieldTable, type FieldTableType, type FieldWidth,
} from "@/lib/configuration/field-table"`, `import {
  isFieldWidth, resolveFieldTable,
  type CustomFieldSource, type FieldDefaults, type FieldOverlay, type FieldTable, type FieldTableType, type FieldWidth,
} from "@/lib/configuration/field-table"`)
rep(`async function customFieldsFor(workspaceId: string, docType: FieldTableType): Promise<CustomFieldSource[]> {
  const templates = await prisma.documentTemplate.findMany({
    where: { workspaceId, documentType: docType, isSystem: false },
    select: { versions: { orderBy: { version: "desc" }, take: 1, select: { fields: true } } },
  })
  const fields: CustomFieldSource[] = []
  for (const template of templates) {
    const version = template.versions[0]
    if (!version) continue
    let parsed
    try { parsed = parseTemplateFields(version.fields) } catch { continue }
    for (const field of parsed) fields.push({ key: field.key, label: field.label, required: field.required })
  }
  return fields
}`, `/** The type's template fields: system templates give the defaults (what Required means today
 * before any owner touched the table), non-system templates give the custom fields. */
async function templateFieldsFor(workspaceId: string, docType: FieldTableType): Promise<{ custom: CustomFieldSource[]; defaults: FieldDefaults }> {
  const templates = await prisma.documentTemplate.findMany({
    where: { workspaceId, documentType: docType },
    select: { isSystem: true, versions: { orderBy: { version: "desc" }, take: 1, select: { fields: true } } },
  })
  const custom: CustomFieldSource[] = []
  const defaults: FieldDefaults = {}
  for (const template of templates) {
    const version = template.versions[0]
    if (!version) continue
    let parsed
    try { parsed = parseTemplateFields(version.fields) } catch { continue }
    for (const field of parsed) {
      if (template.isSystem) { if (!(field.key in defaults)) defaults[field.key] = { required: field.required } }
      else custom.push({ key: field.key, label: field.label, required: field.required })
    }
  }
  return { custom, defaults }
}`)
rep(`  const [custom, overlay] = await Promise.all([customFieldsFor(workspaceId, docType), overlayFor(workspaceId, docType)])
  return resolveFieldTable(docType, custom, overlay)`, `  const [{ custom, defaults }, overlay] = await Promise.all([templateFieldsFor(workspaceId, docType), overlayFor(workspaceId, docType)])
  return resolveFieldTable(docType, custom, overlay, defaults)`)
save()

load('lib/configuration/field-table.test.ts')
rep(`    expect(table.rows[0]).toMatchObject({ key: "vendor", label: "Supplier", editable: true, required: true, requiredLocked: true, width: "normal", position: 0 })`, `    expect(table.rows[0]).toMatchObject({ key: "vendor", label: "Supplier", editable: true, required: true, requiredLocked: true, width: "normal", position: 0, stored: false })
    // Optional check fields are not locked — forcing IBAN required would hold every invoice without one.
    expect(table.rows.find((row) => row.key === "payment_iban")).toMatchObject({ required: false, requiredLocked: false })
    expect(table.rows.find((row) => row.key === "shipping_total")).toMatchObject({ requiredLocked: false })`)
rep(`  it("sentence-cases keys", () => {`, `  it("takes Required defaults from the template until a row is stored, and the pane keeps template flags for unstored rows", () => {
    const table = resolveFieldTable("invoice", [], [], { due_date: { required: true } })
    expect(table.rows.find((row) => row.key === "due_date")).toMatchObject({ required: true, stored: false })
    const fields = applyFieldTable([{ key: "due_date", label: "Due date", type: "string", required: false }] as never, table)
    expect(fields[0].required).toBe(false)
  })

  it("sentence-cases keys", () => {`)
save()

// 2. Field table editor: locked checkbox stays focusable (aria-disabled), sticky first column at 390, lock contrast.
load('components/admin/field-table-editor.tsx')
rep(`                  ? <span className="inline-flex items-center gap-1 text-slate-500" title="Checks read this field, so it stays required.">
                      <input id={requiredId} type="checkbox" className="h-4 w-4 accent-emerald-700" checked readOnly aria-label={\`\${row.label} required — checks read this field, so it stays required\`} disabled />
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                    </span>`, `                  ? <span className="inline-flex items-center gap-1 text-slate-600">
                      <input id={requiredId} type="checkbox" className="h-4 w-4 accent-emerald-700" checked readOnly aria-disabled="true"
                        aria-label={\`\${row.label} required — checks read this field, so it stays required\`} onChange={() => undefined} onKeyDown={(event) => { if (event.key === " ") event.preventDefault() }} onClick={(event) => event.preventDefault()} />
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">Checks read this field, so it stays required.</span>
                    </span>`)
rep(`            <th scope="col" className="pb-2 pr-4 text-[13px] font-medium text-slate-500">Field</th>`, `            <th scope="col" className="sticky left-0 z-10 bg-white pb-2 pr-4 text-[13px] font-medium text-slate-500">Field</th>`)
rep(`              <td className="py-1.5 pr-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{row.label}</span>`, `              <td className="sticky left-0 z-10 max-w-[13rem] bg-white py-1.5 pr-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{row.label}</span>`)
rep(`                <div className="text-xs text-slate-500">{row.hint}</div>`, `                <div className="truncate text-xs text-slate-500" title={row.hint}>{row.hint}</div>`)
rep(`    if (!result.success) { setError(result.error ?? "Couldn't save the field table"); return }
    setSaved(snapshot(rows)); setStamp(result.data?.stamp ?? null); setSavedAt(Date.now())`, `    if (!result.success) { setError(result.error ?? "Couldn't save — the server didn't say why. Your changes are still here."); return }
    setSaved(snapshot(rows)); setStamp(result.data?.stamp ?? null); setSavedAt(Date.now())`)
rep(`    <AdminSaveBar dirty={dirty} pending={pending} error={error} savedAt={savedAt} onSave={() => void save()} onDiscard={discard} disabled={readOnly} />`, `    <AdminSaveBar dirty={dirty} pending={pending} error={error} savedAt={savedAt} onSave={() => void save()} onDiscard={discard} onSavedShown={clearSaved} disabled={readOnly} />`)
rep(`  const discard = () => { setRows(initial); setError(null) }`, `  const discard = () => { setRows(initial); setError(null) }
  const clearSaved = useCallback(() => setSavedAt(null), [])`)
save()

// 3. Autonomy form: computed QA hint, clear "Saved".
load('components/settings/automation-config-form.tsx')
rep(`              How much of the published work is spot-checked anyway. 0.05 sends one in twenty to a reviewer without holding it up.`, `              How much of the published work is spot-checked anyway.{" "}
              {qaSampleRate > 0 && qaSampleRate <= 1 ? \`\${qaSampleRate.toFixed(2)} sends about one in \${Math.max(1, Math.round(1 / qaSampleRate))} to a reviewer without holding it up.\` : "0 spot-checks nothing."}`)
rep(`    <AdminSaveBar dirty={dirty} pending={pending} error={saveError} savedAt={savedAt} disabled={readOnly}`, `    <AdminSaveBar dirty={dirty} pending={pending} error={saveError} savedAt={savedAt} disabled={readOnly} onSavedShown={() => setSavedAt(null)}`)
save()

// 4. Admin nav: groups as labelled groups, caption readable in full.
load('components/admin/admin-nav.tsx')
rep(`        <div key={group.caption} className="mb-6 last:mb-0">
          <p className="mb-1.5 truncate px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500" title={group.caption}>{group.caption}</p>
          <ul className="space-y-px">`, `        <div key={group.caption} className="mb-6 last:mb-0">
          <p id={\`admin-group-\${groupIndex}\`} className="mb-1.5 break-words px-2.5 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-slate-500">{group.caption}</p>
          <ul className="space-y-px" role="group" aria-labelledby={\`admin-group-\${groupIndex}\`}>`)
rep(`      {groups.map((group) => (`, `      {groups.map((group, groupIndex) => (`)
save()

// 5. Admin UI: honest phone note comment; layout adds the leave guard.
load('components/admin/admin-ui.tsx')
rep(`/** #231 Q18: Admin is a desktop area. A deep link on a phone still resolves, read-only, under
 * this one line — the controls below it are disabled by each page. */`, `/** #231 Q18: Admin is a desktop area. A deep link on a phone still resolves under this one line;
 * the controls stay live (an owner in a pinch can still act), the save bar sits above the tab
 * bar, and the note says where the work belongs. */`)
save()
load('app/(app)/workspaces/[workspaceId]/admin/layout.tsx')
rep(`import { AdminNav, type AdminNavGroup } from "@/components/admin/admin-nav"`, `import { AdminLeaveGuard } from "@/components/admin/admin-leave-guard"
import { AdminNav, type AdminNavGroup } from "@/components/admin/admin-nav"`)
rep(`  return <div className="flex min-h-0 flex-1 bg-white">
    <AdminNav groups={groups} />`, `  return <div className="flex min-h-0 flex-1 bg-white">
    <AdminLeaveGuard />
    <AdminNav groups={groups} />`)
save()

// 6. Vocabulary: "Add warn check" button, Jurisdiction module name.
load('components/settings/warn-checks-admin.tsx')
s = s.split('Add warn check').join('Add check').split('Save warn check').join('Save check')
save()
load('lib/modules/index.ts')
rep(`{ key: "jurisdiction", name: "Jurisdiction", description: "The workspace's tax jurisdiction, rate snapshots, and rule pack — required for AP inbound.", industry: "finance", tier: "always", activation: "enable", navItems: [{ href: "settings/tax", label: "Jurisdiction", icon: "landmark" }] },`,
    `{ key: "jurisdiction", name: "Tax", description: "The company's tax jurisdiction, rate snapshots, and rule pack — required before email intake accepts an invoice.", industry: "finance", tier: "always", activation: "enable", navItems: [{ href: "admin/configuration/tax", label: "Tax", icon: "landmark" }] },`)
rep(`{ key: "supplier-rules", name: "Supplier rules", description: "Auto-code recurring suppliers and, optionally, auto-publish them.", industry: "finance", tier: "always", activation: "enable", navItems: [{ href: "settings/rules", label: "Rules", icon: "workflow" }] },`,
    `{ key: "supplier-rules", name: "Supplier rules", description: "Auto-code recurring suppliers and, optionally, auto-publish them.", industry: "finance", tier: "always", activation: "enable", navItems: [{ href: "admin/suppliers", label: "Suppliers", icon: "workflow" }] },`)
save()

// 7. Approval Flows: the list before the form.
load('app/(app)/workspaces/[workspaceId]/admin/approval-flows/page.tsx')
{
  const formStart = s.indexOf('    {owner && (\n      <Panel title="Add a workflow"')
  const formEnd = s.indexOf('    )}\n', formStart) + '    )}\n'.length
  const form = s.slice(formStart, formEnd)
  s = s.slice(0, formStart) + s.slice(formEnd)
  s = s.replace('    </Panel>\n  </AdminPage>\n}', '    </Panel>\n\n' + form.replace('    {owner && (\n', '    {owner && (\n').trimEnd() + '\n  </AdminPage>\n}')
}
save()

// 8. PO Mismatch: sentence-first instead of the hero figure.
load('app/(app)/workspaces/[workspaceId]/admin/po-mismatch-flows/page.tsx')
rep(`          <Figure
            value={\`\${resolved}\`}
            state={resolved > 0 ? "auto" : "idle"}
            caption={<>
              {resolved === 1 ? "match has been settled" : "matches have been settled"} out of {summary.total} the
              pipeline proposed. {pending > 0 ? \`\${pending} still waiting on a decision.\` : "Nothing is waiting on a decision."}
            </>}
          />`, `          <p className="max-w-[52ch] text-sm leading-relaxed text-slate-700">
            <span className="font-semibold tabular-nums text-slate-900">{resolved}</span> of the {summary.total} {summary.total === 1 ? "match" : "matches"} the pipeline proposed {resolved === 1 ? "has" : "have"} been settled.{" "}
            {pending > 0 ? \`\${pending} still \${pending === 1 ? "waits" : "wait"} on a decision.\` : "Nothing is waiting on a decision."}
          </p>`)
rep(`import { Empty, Figure, Ledger, LedgerRow, Panel } from "@/components/automation/automation-ui"`, `import { Empty, Ledger, LedgerRow, Panel } from "@/components/automation/automation-ui"`)
save()

// 9. Companies: list the current workspace even when personal.
load('app/(app)/workspaces/[workspaceId]/admin/companies/page.tsx')
rep(`  const companies = workspaces.filter((workspace) => workspace.kind !== "personal")
  const personal = workspaces.find((workspace) => workspace.kind === "personal")
  const roleWord = (role?: string) => role === "owner" ? "Owner" : role === "reviewer" ? "Reviewer" : "Member"`, `  const companies = workspaces.filter((workspace) => workspace.kind !== "personal" || workspace.id === workspaceId)
  const personal = workspaces.find((workspace) => workspace.kind === "personal")
  const roleWord = (role?: string) => role === "owner" ? "Owner" : role === "reviewer" ? "Reviewer" : "Member"`)
rep(`    <Panel title="Your companies" note={\`\${companies.length} \${companies.length === 1 ? "company" : "companies"}\${personal ? ", plus your personal workspace" : ""}.\`}>`, `    <Panel title="Your companies" note={\`\${companies.length} \${companies.length === 1 ? "company" : "companies"} you belong to.\`}>`)
rep(`                <p className="text-xs text-slate-600">{roleWord(workspace.members[0]?.role)}</p>`, `                <p className="text-xs text-slate-600">{workspace.kind === "personal" ? "Personal workspace · " : ""}{roleWord(workspace.members[0]?.role)}</p>`)
rep(`      {personal && <p className="mt-4 max-w-[60ch] text-xs text-slate-600">Your personal workspace, {personal.name}, stays yours and is never part of a company.</p>}`, `      {personal && <p className="mt-4 max-w-[60ch] text-xs text-slate-600">Your personal workspace stays yours and is never part of an organization.</p>}`)
save()

console.log('ok')

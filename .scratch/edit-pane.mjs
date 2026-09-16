// #252: the Detail pane reads the field table — Required from Configuration, and a field the
// table marks not editable renders read-only with the reason.
import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
let p = `${root}/components/pipeline/document-detail/field-row.tsx`
let s = readFileSync(p, 'utf8')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b) }
rep(`import type { DocumentFieldDefinition } from "@/lib/document-templates"`, `import type { ConfiguredFieldDefinition } from "@/lib/configuration/field-table"`)
rep(`  field: DocumentFieldDefinition
  value: unknown`, `  /** #252: \`readOnly\` comes from Admin › Configuration › Fields (not editable). */
  field: ConfiguredFieldDefinition
  value: unknown`)
rep(`  const lowConfidence = typeof confidence === "number" && confidence < LOW_CONFIDENCE
  const isArray = field.type === "array"`, `  const lowConfidence = typeof confidence === "number" && confidence < LOW_CONFIDENCE
  const isArray = field.type === "array"
  const readOnly = field.readOnly === true
  const readOnlyTitle = "Not editable — set under Admin › Configuration › Fields"`)
rep(`      <label htmlFor={field.key} className="text-xs font-medium text-slate-500">
        {field.label}{field.required && <span className="ml-0.5 text-red-400">*</span>}
      </label>`, `      <label htmlFor={field.key} className="text-xs font-medium text-slate-500">
        {field.label}{field.required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}{field.required && <span className="sr-only"> (required)</span>}
      </label>
      {readOnly && <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-700" title={readOnlyTitle}>Read-only</span>}`)
rep(`<input ref={inputRef as React.RefObject<HTMLInputElement>} id={field.key} name={field.key} type="checkbox" aria-describedby={checks.length ? checkDescriptionId : undefined} className="h-4 w-4 rounded accent-emerald-600" value="true" defaultChecked={value === true} />Yes</label>`,
    `<input ref={inputRef as React.RefObject<HTMLInputElement>} id={field.key} name={field.key} type="checkbox" aria-describedby={checks.length ? checkDescriptionId : undefined} className="h-4 w-4 rounded accent-emerald-600" value="true" defaultChecked={value === true} disabled={readOnly} />Yes</label>`)
rep(`<select ref={inputRef as React.RefObject<HTMLSelectElement>} id={field.key} name={field.key} aria-describedby={checks.length ? checkDescriptionId : undefined} defaultValue={typeof value === "string" ? value : ""} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 transition-colors focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100">`,
    `<select ref={inputRef as React.RefObject<HTMLSelectElement>} id={field.key} name={field.key} aria-describedby={checks.length ? checkDescriptionId : undefined} defaultValue={typeof value === "string" ? value : ""} disabled={readOnly} title={readOnly ? readOnlyTitle : undefined} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 transition-colors focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-600">`)
rep(`        defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        className={\`h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-300 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 \${field.type === "number" ? "tabular-nums" : ""}\`} />`,
    `        defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        readOnly={readOnly} aria-readonly={readOnly || undefined} title={readOnly ? readOnlyTitle : undefined}
        className={\`h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-300 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 read-only:bg-slate-50 read-only:text-slate-600 \${field.type === "number" ? "tabular-nums" : ""}\`} />`)
writeFileSync(p, s)

p = `${root}/app/(app)/workspaces/[workspaceId]/documents/[documentId]/page.tsx`
s = readFileSync(p, 'utf8')
rep(`import { parseTemplateFields } from "@/lib/document-templates"`, `import { parseTemplateFields } from "@/lib/document-templates"
import { applyFieldTable, isFieldTableType } from "@/lib/configuration/field-table"
import { getSavedFieldTable } from "@/models/field-configs"`)
rep(`  const fields = parseTemplateFields(document.fieldSnapshot)
  const confidence = document.confidence`, `  // #252: Admin › Configuration › Fields overlays Required and not-editable on the template's
  // own definitions. Only read when the workspace has saved a table for this type.
  const configuredType = resolveDocType(document)
  const fieldTable = isFieldTableType(configuredType) ? await getSavedFieldTable(workspaceId, configuredType) : null
  const fields = applyFieldTable(parseTemplateFields(document.fieldSnapshot), fieldTable)
  const confidence = document.confidence`)
writeFileSync(p, s)
console.log('ok')

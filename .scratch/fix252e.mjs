// #252 fix batch E: the final critique's execution leftovers (copy hygiene).
import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
let p, s
const load = (f) => { p = `${root}/${f}`; s = readFileSync(p, 'utf8') }
const save = () => writeFileSync(p, s)
const rep = (a, b) => { if (!s.includes(a)) throw new Error(`missing in ${p}: ` + a.slice(0, 80)); s = s.replace(a, b) }

// Danger zone: "company" for a team workspace, "workspace" for a personal one.
load('components/workspace/danger-zone.tsx')
rep(`  const [name, setName] = useState(workspaceName)`, `  const [name, setName] = useState(workspaceName)
  // #231 Q8: "Company" in Admin; a personal workspace is the one thing that is not a company.
  const noun = workspaceKind === "personal" ? "workspace" : "company"`)
s = s.replace(`<CardTitle>Leave workspace</CardTitle>`, `<CardTitle>Leave this {noun}</CardTitle>`)
s = s.replace(`>Leave workspace</Button>`, `>Leave this {noun}</Button>`)
s = s.replace(`title="Leave this workspace?"`, `title={\`Leave this \${noun}?\`}`)
s = s.replace(`<CardTitle>Workspace name</CardTitle>`, `<CardTitle>{noun === "company" ? "Company name" : "Workspace name"}</CardTitle>`)
s = s.replace(`toast.error(result.error || "Could not rename the workspace"); return }
            toast.success("Workspace renamed")`, `toast.error(result.error ? \`Couldn't rename — \${result.error} Nothing changed.\` : "Couldn't rename — the server didn't say why. Nothing changed."); return }
            toast.success(noun === "company" ? "Company renamed" : "Workspace renamed")`)
s = s.replace(`<CardTitle className="text-destructive">Delete workspace</CardTitle>`, `<CardTitle className="text-destructive">Delete this {noun}</CardTitle>`)
s = s.replace(`>Delete this workspace</Button>`, `>Delete this {noun}</Button>`)
s = s.replace(`title="Delete this workspace?"`, `title={\`Delete this \${noun}?\`}`)
s = s.replace(`toast.error(result.error || "Could not leave the workspace"); return }`, `toast.error(result.error ? \`Couldn't leave — \${result.error} Nothing changed.\` : "Couldn't leave — the server didn't say why. Nothing changed."); return }`)
s = s.replace(`toast.error(result.error || "Could not delete the workspace"); return }`, `toast.error(result.error ? \`Couldn't delete — \${result.error} Nothing changed.\` : "Couldn't delete — the server didn't say why. Nothing changed."); return }`)
s = s.replace(/text-muted-foreground/g, 'text-slate-600')
save()

// Toast copy on the relocated instant-apply controls: name that nothing changed.
load('components/workspace/jurisdiction-picker.tsx')
rep(`toast.error(result.error || "Could not change the jurisdiction"); return }`, `toast.error(result.error ? \`Couldn't change the jurisdiction — \${result.error} Nothing changed.\` : "Couldn't change the jurisdiction — the server didn't say why. Nothing changed."); return }`)
rep(`toast.error("Could not reach the server — the setting was not changed")`, `toast.error("Couldn't reach the server. Nothing changed.")`)
save()
load('components/workspace/approval-workflow-row.tsx')
rep(`toast.error(result.error || "Could not update the workflow")`, `toast.error(result.error ? \`Couldn't update the workflow — \${result.error} Nothing changed.\` : "Couldn't update the workflow — the server didn't say why. Nothing changed.")`)
rep(`toast.error(result.error || "Could not delete the workflow"); return }`, `toast.error(result.error ? \`Couldn't delete the workflow — \${result.error} Nothing changed.\` : "Couldn't delete the workflow — the server didn't say why. Nothing changed."); return }`)
s = s.split(`toast.error("Could not reach the server")`).join(`toast.error("Couldn't reach the server. Nothing changed.")`)
save()
load('components/workspace/deferred-vat-scheme-picker.tsx')
rep(`toast.error(res.error || "Could not save setting")`, `toast.error(res.error ? \`Couldn't save — \${res.error} Nothing changed.\` : "Couldn't save — the server didn't say why. Nothing changed.")`)
save()

// What's on: no raw industry enum in a sentence.
load('app/(app)/workspaces/[workspaceId]/admin/configuration/whats-on/page.tsx')
rep(`import { modulesForIndustry } from "@/lib/modules"`, `import { INDUSTRIES, modulesForIndustry } from "@/lib/modules"`)
rep(`  const capabilities = context.capabilities
`, `  const capabilities = context.capabilities
  const industryLabel = INDUSTRIES.find((entry) => entry.key === industry)?.label ?? "this"
`)
rep(`<AdminPage title="What's on" intro={\`What is turned on for this \${industry} company. Turning a module off hides it; nothing already in it is deleted.\`}>`, `<AdminPage title="What's on" intro={\`What is turned on for \${context.workspace.name}. Turning a module off hides it; nothing already in it is deleted.\`}>`)
rep(`<Panel title="Included" note={\`On by default for a \${industry} company.\`}>`, `<Panel title="Included" note={\`On by default for a \${industryLabel} company.\`}>`)
save()

// Phone note: honest about live controls.
load('components/admin/admin-ui.tsx')
rep(`    Admin is a desktop area. Open DocuBite on a computer to make changes.`, `    Admin is a desktop area. Changes made here on a phone still save; the full tables are easier on a computer.`)
save()

// Field table: hints wrap at md+, locked Editable shows a visible lock.
load('components/admin/field-table-editor.tsx')
rep(`<div className="hidden truncate text-xs text-slate-500 md:block" title={row.hint}>{row.hint}</div>`, `<div className="hidden max-w-[36ch] text-xs leading-snug text-slate-500 md:block">{row.hint}</div>`)
rep(`              <td className="py-1.5 pr-2 text-center md:pr-4">
                <input id={editableId} type="checkbox" className="h-4 w-4 accent-emerald-700" checked={row.editable} disabled={readOnly || row.required}
                  aria-label={row.required ? \`\${row.label} editable — stays on while the field is required\` : \`\${row.label} editable\`} onChange={(event) => update(row.key, { editable: event.target.checked })} />
              </td>`, `              <td className="py-1.5 pr-2 text-center md:pr-4">
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <input id={editableId} type="checkbox" className="h-4 w-4 accent-emerald-700" checked={row.editable} disabled={readOnly || row.required}
                    aria-label={row.required ? \`\${row.label} editable — stays on while the field is required\` : \`\${row.label} editable\`} onChange={(event) => update(row.key, { editable: event.target.checked })} />
                  {row.required && !readOnly && <Lock className="h-3.5 w-3.5" aria-hidden />}
                </span>
              </td>`)
save()

// PO Mismatch: the two summary sentences as one paragraph at body weight.
load('app/(app)/workspaces/[workspaceId]/admin/po-mismatch-flows/page.tsx')
rep(`        <section className="grid gap-8 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:items-center">`, `        <section className="grid gap-x-10 gap-y-4 md:grid-cols-2 md:items-start">`)
save()
console.log('ok')

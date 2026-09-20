"use client"

import { useCallback, useId, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Lock } from "lucide-react"
import { saveFieldTableAction } from "@/app/(app)/workspaces/[workspaceId]/admin/configuration/actions"
import { AdminSaveBar } from "@/components/admin/admin-save-bar"
import { NativeSelect } from "@/components/ui/native-select"
import { FIELD_WIDTHS, FIELD_WIDTH_LABELS, type FieldTableRow, type FieldTableType, type FieldWidth } from "@/lib/configuration/field-table"

type EditableRow = Pick<FieldTableRow, "key" | "label" | "hint" | "custom" | "editable" | "required" | "requiredLocked" | "direction" | "width">

const snapshot = (rows: EditableRow[]) => JSON.stringify(rows.map((row) => [row.key, row.editable, row.required, row.width]))

/** #231 Q11/Q22 (#252): the field table itself — a real `<table>`, 40px rows, one control per
 * cell, each control named after the field it changes. Order is moved with buttons, not drag,
 * so it works from the keyboard. Nothing is saved until the sticky bar's Save; Discard puts
 * the rows back exactly as they were loaded.
 *
 * The page keys this component by document type, so a type switch mounts a fresh editor.
 * `stamp` is the table's last-saved time; the save carries it so a table another owner saved
 * meanwhile is refused with a reload notice rather than overwritten. */
export function FieldTableEditor({ workspaceId, docType, typeLabel, rows: initial, stamp: initialStamp, readOnly }: {
  workspaceId: string
  docType: FieldTableType
  typeLabel: string
  rows: FieldTableRow[]
  stamp: string | null
  readOnly: boolean
}) {
  const router = useRouter()
  const captionId = useId()
  const [rows, setRows] = useState<EditableRow[]>(initial)
  const [saved, setSaved] = useState(() => snapshot(initial))
  const [stamp, setStamp] = useState(initialStamp)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [announce, setAnnounce] = useState("")

  const dirty = useMemo(() => snapshot(rows) !== saved, [rows, saved])

  // Required ⇒ Editable: a required field a reviewer cannot fill would hold a document in review
  // that nobody can free. Ticking Required turns Editable on; Editable stays on while Required is.
  const update = (key: string, patch: Partial<EditableRow>) => setRows((current) => current.map((row) => {
    if (row.key !== key) return row
    const next = { ...row, ...patch }
    if (next.required) next.editable = true
    return next
  }))
  const move = (index: number, direction: -1 | 1) => {
    setRows((current) => {
      const next = [...current]
      const target = index + direction
      if (target < 0 || target >= next.length) return current
      // The Direction row is pinned first — never a swap target or mover.
      if (next[index].direction || next[target].direction) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      setAnnounce(`${next[target].label} moved to position ${target + 1} of ${next.length}`)
      return next
    })
  }

  const save = useCallback(async () => {
    setPending(true); setError(null)
    const result = await saveFieldTableAction({ workspaceId, docType, expectedUpdatedAt: stamp, rows: rows.filter((row) => !row.direction).map((row) => ({ key: row.key, editable: row.editable, required: row.required, width: row.width })) })
    setPending(false)
    if (!result.success) { setError(result.error ?? "Couldn't save — the server didn't say why. Your changes are still here."); return }
    setSaved(snapshot(rows)); setStamp(result.data?.stamp ?? null); setSavedAt(Date.now())
    router.refresh()
  }, [workspaceId, docType, stamp, rows, router])

  const discard = () => { setRows(initial); setError(null) }
  // evaluate H6/H10 (#252): the padlock explained itself only to screen readers; sighted owners
  // saw a grey tick they could not change and no reason. One visible line under the table.
  const locked = rows.filter((row) => row.requiredLocked && !row.direction)
  const lockedCount = locked.length
  const lockedList = locked.map((row) => row.label).join(", ").replace(/, ([^,]*)$/, " and $1")
  const clearSaved = useCallback(() => setSavedAt(null), [])

  return <div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm md:min-w-[640px]" aria-labelledby={captionId}>
        <caption id={captionId} className="sr-only">Fields on the {typeLabel} Detail pane and in the {typeLabel} queue</caption>
        <thead>
          <tr className="border-b border-hairline text-left align-bottom">
            <th scope="col" className="pb-2 pr-2 text-[13px] font-medium text-slate-500 md:pr-4">Field</th>
            <th scope="col" className="pb-2 pr-2 text-center text-[13px] font-medium text-slate-500 md:pr-4"><span className="md:hidden">Edit</span><span className="hidden md:inline">Editable</span></th>
            <th scope="col" className="pb-2 pr-2 text-center text-[13px] font-medium text-slate-500 md:pr-4"><span className="md:hidden">Req.</span><span className="hidden md:inline">Required</span></th>
            <th scope="col" className="pb-2 pr-2 text-[13px] font-medium text-slate-500 md:pr-4">Width</th>
            <th scope="col" className="w-[4.25rem] whitespace-nowrap pb-2 text-right text-[13px] font-medium text-slate-500 md:w-20"><span className="md:hidden">Move</span><span className="hidden md:inline">Order</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline-soft">
          {rows.map((row, index) => {
            const editableId = `${row.key}-editable`
            const requiredId = `${row.key}-required`
            const widthId = `${row.key}-width`
            return <tr key={row.key} className="h-10">
              <td className="max-w-[6.5rem] py-1.5 pr-2 md:max-w-[13rem] md:pr-4">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-900" title={row.label}>{row.label}</span>
                  {row.custom && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">Custom</span>}
                </div>
                <div className="hidden max-w-[36ch] text-xs leading-snug text-slate-500 md:block">{row.hint}</div>
              </td>
              <td className="py-1.5 pr-2 text-center md:pr-4">
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <input id={editableId} type="checkbox" className="h-4 w-4 accent-emerald-700" checked={row.editable} disabled={readOnly || row.required}
                    aria-label={row.required ? `${row.label} editable — stays on while the field is required` : `${row.label} editable`} onChange={(event) => update(row.key, { editable: event.target.checked })} />
                  {row.required && !readOnly && <Lock className="h-3.5 w-3.5" aria-hidden />}
                </span>
                {row.required && !readOnly && <span className="sr-only">Stays on while the field is required.</span>}
              </td>
              <td className="py-1.5 pr-2 text-center md:pr-4">
                {row.requiredLocked
                  ? <span className="inline-flex items-center gap-1 text-slate-600" title="Checks read this field, so it stays required.">
                      <input id={requiredId} type="checkbox" className="h-4 w-4 accent-emerald-700" checked readOnly aria-disabled="true"
                        aria-label={`${row.label} required — checks read this field, so it stays required`} onChange={() => undefined} onKeyDown={(event) => { if (event.key === " ") event.preventDefault() }} onClick={(event) => event.preventDefault()} />
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">Checks read this field, so it stays required.</span>
                    </span>
                  : <input id={requiredId} type="checkbox" className="h-4 w-4 accent-emerald-700" checked={row.required} disabled={readOnly}
                      aria-label={`${row.label} required`} onChange={(event) => update(row.key, { required: event.target.checked })} />}
              </td>
              <td className="py-1.5 pr-1.5 md:pr-4">
                {!row.direction && <NativeSelect id={widthId} value={row.width} disabled={readOnly} aria-label={`${row.label} column width`} className="h-8 w-[6rem] md:w-[7.5rem]"
                  onChange={(event) => update(row.key, { width: event.target.value as FieldWidth })}>
                  {FIELD_WIDTHS.map((width) => <option key={width} value={width}>{FIELD_WIDTH_LABELS[width]}</option>)}
                </NativeSelect>}
              </td>
              <td className="py-1.5 text-right">
                {!row.direction && <div className="inline-flex gap-0.5">
                  <button type="button" onClick={() => move(index, -1)} disabled={readOnly} aria-disabled={index === 0 || rows[index - 1]?.direction || undefined}
                    aria-label={`Move ${row.label} up`}
                    className="inline-flex h-8 w-7 items-center justify-center rounded-md text-slate-600 md:w-8 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40 aria-disabled:opacity-40">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={readOnly} aria-disabled={index === rows.length - 1 || undefined}
                    aria-label={`Move ${row.label} down`}
                    className="inline-flex h-8 w-7 items-center justify-center rounded-md text-slate-600 md:w-8 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40 aria-disabled:opacity-40">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>}
              </td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
    {lockedCount > 0 && <p className="mt-3 flex max-w-[60ch] items-start gap-1.5 text-xs leading-snug text-slate-500">
      <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <span>{lockedCount === 1 ? "One field is locked" : `${lockedCount} fields are locked`}: checks read {lockedList}, so {lockedCount === 1 ? "it stays" : "they stay"} required and editable.</span>
    </p>}
    <p className="sr-only" aria-live="polite">{announce}</p>
    <AdminSaveBar dirty={dirty} pending={pending} error={error} savedAt={savedAt} onSave={() => void save()} onDiscard={discard} onSavedShown={clearSaved} disabled={readOnly}
      errorAction={error?.startsWith("Configuration changed") ? { label: "Reload", onClick: () => { discard(); router.refresh() } } : undefined} />
  </div>
}

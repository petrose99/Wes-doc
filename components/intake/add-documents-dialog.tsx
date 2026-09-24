"use client"

import { uploadDocumentsAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { DOCUMENT_TYPES } from "@/components/extract/extract-panel"
import type { SheetTemplate } from "@/components/extract/types"
import { InboundAddressLine } from "@/components/intake/inbound-address-line"
import { Dialog } from "@/components/ui/dialog"
import { Loader2, Check, X as XIcon } from "lucide-react"
import { forwardRef, useImperativeHandle, useRef, useState } from "react"

/** #266 spec Screen 3: "Add ‹type›" — the one surface that turns files on disk into rows on a
 * typed queue. Reuses `uploadDocumentsAction` (the same document-creation path `ExtractPanel`'s
 * `uploadRows` calls) and `DOCUMENT_TYPES` (the same accepted-mime allowlist) as plumbing; the
 * markup here is new because `ExtractPanel`'s own markup is worksheet UI (ZIP, camera, shape
 * match) this 4-type intake dialog must not inherit — preflight B4. */

const MAX_BATCH_BYTES = 200 * 1024 * 1024

/** Plural queue-vocabulary labels (spec decision 9 / B3) — deliberately not `SheetTemplate.name`
 * (singular, "Invoice") since the header/footer/receipt copy is always plural ("Add invoices"). */
export const TYPE_LABELS: Record<string, string> = { invoice: "invoices", purchase_order: "purchase orders", receipt: "receipts", bank_statement: "bank statements" }

/** Imperative handle so `AddTypeButton` (owner of the queue-area drop target, #266 Screen 2) can
 * pre-stage a drop's files before opening the dialog, without threading a "pending files" prop
 * through render (this component stays mounted across open/close so its own `addFiles` closure is
 * always live). */
export type AddDocumentsDialogHandle = { addFiles: (files: FileList | File[]) => void }

const EXTENSION_FALLBACK = /\.(pdf|jpe?g|png|webp|heic)$/i

function acceptFile(file: File) {
  if (file.size <= 0) return false
  if (DOCUMENT_TYPES.split(",").includes(file.type)) return true
  // Drag-and-drop can hand back an empty `type` (some OS file managers never set it) — the
  // extension is the only signal left in that case, same reasoning as the cap check below: this
  // dialog cannot rely on the input's `accept` attribute, which only filters the OS picker UI.
  return !file.type && EXTENSION_FALLBACK.test(file.name)
}

function formatMB(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type Row = { localId: string; file: File; filename: string; sizeBytes: number; status: "staged" | "uploading" | "done" | "failed"; error: string | null }

export const AddDocumentsDialog = forwardRef<AddDocumentsDialogHandle, {
  open: boolean
  onClose: () => void
  workspaceId: string
  /** `ensurePipelineFile`'s file id — the shared storage target every typed queue's intake writes
   * to (spec Screen 3 interaction logic). */
  fileId: string
  templates: SheetTemplate[]
  initialType: string
  /** Server-computed per #264's first-use state; omitted (section not rendered) when null. */
  inboundAddress: string | null
  /** #374: the deployment's WhatsApp number, rendered beside `inboundAddress` when the channel is on. */
  whatsappNumber?: string | null
  /** Hands the settled document ids to the caller's own `useExtractionProgress` instance so the
   * existing toast-per-terminal-transition behavior keeps firing after this dialog closes — same
   * "survives close" pattern as `FileHubUploadButton` (spec interaction logic, B4). */
  onUploaded: (documentIds: string[]) => void
}>(function AddDocumentsDialog({ open, onClose, workspaceId, fileId, templates, initialType, inboundAddress, whatsappNumber = null, onUploaded }, ref) {
  // The queue the dialog was opened from is the type (CONTEXT.md "Document type": never asked
  // again on that queue; a wrong one is fixed by Move) — no in-dialog picker (2026-09-24).
  const type = initialType
  const [rows, setRows] = useState<Row[]>([])
  const [rejections, setRejections] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<{ filename: string }[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowsRef = useRef<Row[]>([])
  rowsRef.current = rows

  const locked = sending
  const totalBytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0)

  useImperativeHandle(ref, () => ({ addFiles }))

  function addFiles(incoming: FileList | File[]) {
    const files = [...incoming]
    const reasons: string[] = []
    const accepted: File[] = []
    let running = totalBytes
    for (const file of files) {
      if (!acceptFile(file)) { reasons.push(`${file.name} — not a PDF or image`); continue }
      if (running + file.size > MAX_BATCH_BYTES) { reasons.push(`${file.name} — over the 200 MB storage cap`); continue }
      running += file.size
      accepted.push(file)
    }
    setRejections(reasons)
    if (accepted.length) setRows((previous) => [...previous, ...accepted.map((file): Row => ({ localId: crypto.randomUUID(), file, filename: file.name, sizeBytes: file.size, status: "staged", error: null }))])
  }

  function removeRow(localId: string) {
    setRows((previous) => previous.filter((row) => row.localId !== localId))
  }

  async function uploadAll() {
    const toSend = rowsRef.current.filter((row) => row.status === "staged" || row.status === "failed")
    if (!toSend.length) return
    setSending(true)
    setRows((previous) => previous.map((row) => (toSend.some((sent) => sent.localId === row.localId) ? { ...row, status: "uploading", error: null } : row)))
    const template = templates.find((candidate) => candidate.code === type)
    const succeeded: { filename: string }[] = []
    const settledIds: string[] = []
    for (const row of toSend) {
      const formData = new FormData()
      formData.append("files", row.file)
      if (template) formData.set("templateId", template.id)
      let failure: string | null = null
      let documentId: string | null = null
      let filename = row.filename
      try {
        const result = await uploadDocumentsAction(workspaceId, fileId, formData)
        const uploaded = result.success ? result.data?.documents[0] : undefined
        if (uploaded) { documentId = uploaded.id; filename = uploaded.filename }
        else failure = result.error || "Couldn't upload"
      } catch { failure = "Couldn't upload" }
      setRows((previous) => previous.map((current) => (current.localId === row.localId ? { ...current, status: documentId ? "done" : "failed", error: failure } : current)))
      if (documentId) { succeeded.push({ filename }); settledIds.push(documentId) }
    }
    if (settledIds.length) onUploaded(settledIds)
    setSending(false)
    // rowsRef.current is stale here: the setRows above hasn't flushed through a render yet, so
    // it still reports this batch's rows by their pre-upload status. Judge this batch from what
    // we just observed (succeeded vs toSend) and only defer to the ref for rows outside it.
    const otherRows = rowsRef.current.filter((row) => !toSend.some((sent) => sent.localId === row.localId))
    if (succeeded.length === toSend.length && otherRows.every((row) => row.status === "done")) setDone(succeeded)
  }

  function reset() {
    setRows([]); setRejections([]); setDone(null)
  }

  const label = TYPE_LABELS[type] ?? type
  const nStaged = rows.filter((row) => row.status === "staged").length

  return <Dialog open={open} title={`Add ${label}`} onClose={locked ? () => {} : () => { reset(); onClose() }} initialFocus="#add-documents-drop">
    <div className="flex flex-col gap-4 px-5 py-4">
      {done ? <>
        <p className="text-sm text-slate-700">{done.length} added to {TYPE_LABELS[type] ? `${TYPE_LABELS[type][0].toUpperCase()}${TYPE_LABELS[type].slice(1)}` : label}</p>
        <ul className="flex flex-col gap-1 text-sm text-slate-600">{done.map((item, index) => <li key={index}>{item.filename}</li>)}</ul>
      </> : <>
        <div id="add-documents-drop" role="button" tabIndex={0} aria-disabled={locked}
          className="flex flex-col items-center justify-center gap-1.5 border-y-2 border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600 hover:border-emerald-400 hover:bg-emerald-50/40"
          onDrop={(event) => { event.preventDefault(); if (!locked) addFiles(event.dataTransfer.files) }}
          onDragOver={(event) => event.preventDefault()}
          onClick={() => !locked && inputRef.current?.click()}
          onKeyDown={(event) => { if (!locked && (event.key === "Enter" || event.key === " ")) inputRef.current?.click() }}>
          <span>Drag files here or <button type="button" disabled={locked} className="font-medium text-emerald-700 hover:underline" onClick={(event) => { event.stopPropagation(); inputRef.current?.click() }}>Browse</button></span>
        </div>
        <input ref={inputRef} type="file" multiple accept={DOCUMENT_TYPES} className="hidden" disabled={locked}
          onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = "" }} />

        {rejections.map((reason) => <p key={reason} className="text-sm text-red-600">{reason}</p>)}

        {rows.length > 0 && <>
          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => <li key={row.localId} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="flex-1 truncate">{row.filename}</span>
              <span className="shrink-0 text-xs text-slate-400">{formatMB(row.sizeBytes)}</span>
              {row.status === "uploading" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-label="Uploading" />}
              {row.status === "done" && <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Added" />}
              {row.status === "failed" && <>
                <span className="shrink-0 text-xs text-red-600">{row.filename} — {row.error || "couldn't upload"}</span>
                <button type="button" className="shrink-0 text-xs font-medium text-emerald-700 hover:underline" onClick={() => void uploadAll()}>Retry</button>
              </>}
              {(row.status === "staged" || row.status === "failed") && <button type="button" aria-label={`Remove ${row.filename}`} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => removeRow(row.localId)}><XIcon className="h-3.5 w-3.5" /></button>}
            </li>)}
          </ul>
          <p className="text-xs text-slate-500">{formatMB(totalBytes)} of 200 MB used</p>
        </>}

        {inboundAddress && <InboundAddressLine address={inboundAddress} />}
        {whatsappNumber && <InboundAddressLine address={whatsappNumber} channel="whatsapp" />}
      </>}
    </div>
    <div className="flex items-center justify-between border-t px-5 py-3">
      {done
        ? <button type="button" className="ml-auto rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800" onClick={() => { reset(); onClose() }}>Done</button>
        : <>
          <div className="flex items-center gap-3">
            <button type="button" disabled={locked} className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50" onClick={() => { reset(); onClose() }}>Cancel</button>
            {locked && <span className="text-xs text-slate-500">Uploading — hang tight, this won&apos;t take long.</span>}
          </div>
          <button type="button" disabled={locked || !nStaged && !rows.some((row) => row.status === "failed")} onClick={() => void uploadAll()}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:pointer-events-none disabled:opacity-50">
            {sending ? "Adding…" : `Add ${rows.length}`}
          </button>
        </>}
    </div>
  </Dialog>
})

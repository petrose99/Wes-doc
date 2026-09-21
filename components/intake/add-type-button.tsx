"use client"

import { AddDocumentsDialog, TYPE_LABELS, type AddDocumentsDialogHandle } from "@/components/intake/add-documents-dialog"
import type { SheetTemplate } from "@/components/extract/types"
import { useExtractionProgress } from "@/components/extract/use-extraction-progress"
import { Plus } from "lucide-react"
import { forwardRef, useImperativeHandle, useRef, useState } from "react"

/** #266 spec Screen 1/2: the queue header's "Add ‹type›" button, plus the imperative surface
 * `QueueScreen`'s `dropZone.onFiles` wires into (a queue-area drop pre-stages the dialog rather
 * than opening a second entry point). Owns its own `useExtractionProgress` poller instance —
 * same "survives dialog close" reasoning as `FileHubUploadButton` (button doesn't unmount when
 * the dialog closes, so a document queued right before close keeps being polled). */
export type AddTypeButtonHandle = { openWithFiles: (files: FileList) => void }

export const AddTypeButton = forwardRef<AddTypeButtonHandle, {
  workspaceId: string
  /** `ensurePipelineFile`'s file id — the shared storage target this queue's intake writes to. */
  fileId: string
  templates: SheetTemplate[]
  /** This queue's own asserted type — preselects the dialog, stays changeable inside it. */
  type: string
  /** Server-computed per #264's first-use state; omitted (dialog's email section not rendered) when null. */
  inboundAddress: string | null
  /** #374: the deployment's WhatsApp number, shown beside `inboundAddress`; omitted the same way
   * when the channel is off. */
  whatsappNumber?: string | null
}>(function AddTypeButton({ workspaceId, fileId, templates, type, inboundAddress, whatsappNumber = null }, ref) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<AddDocumentsDialogHandle>(null)
  const { statuses, track } = useExtractionProgress(workspaceId, [], undefined, false)
  void statuses

  useImperativeHandle(ref, () => ({
    openWithFiles(files) {
      setOpen(true)
      dialogRef.current?.addFiles(files)
    },
  }))

  const label = TYPE_LABELS[type] ?? type

  return <>
    <button type="button" onClick={() => setOpen(true)}
      className="hidden md:inline-flex items-center gap-2 rounded-[11px] bg-[linear-gradient(180deg,#087a54,#047857)] px-[18px] py-[11px] text-sm font-semibold text-white shadow-[0_1px_2px_rgba(4,120,87,0.4),0_6px_16px_rgba(4,120,87,0.22)] transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-[0_2px_4px_rgba(4,120,87,0.4),0_10px_22px_rgba(4,120,87,0.28)]">
      <Plus className="h-4 w-4" aria-hidden />Add {label}
    </button>
    <AddDocumentsDialog ref={dialogRef} open={open} onClose={() => setOpen(false)}
      workspaceId={workspaceId} fileId={fileId} templates={templates} initialType={type}
      inboundAddress={inboundAddress} whatsappNumber={whatsappNumber} onUploaded={track} />
  </>
})

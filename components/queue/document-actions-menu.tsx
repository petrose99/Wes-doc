"use client"

import { createContext, useContext, useEffect, useId, useState } from "react"
import { ExternalLink, Flag, Loader2, Trash2 } from "lucide-react"
import { PaneMenuItem } from "@/components/queue/detail-pane"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { archiveDocumentsAction, flagDocumentsAction } from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { deleteDocumentsAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { toast } from "sonner"

/** The document a `SplitPane` currently shows, registered with the `PaneFrame` around it so the
 * frame's one ⋯ menu can render Archive / Flag / Delete for whatever document is loaded — #259's
 * "one implementation of each action" (today three copies: the pane's embedded top bar, the
 * standalone top bar, and the bulk bar). */
export type RegisteredDocument = {
  workspaceId: string
  documentId: string
  fileId: string
  filename: string
  flagged: boolean
  archived: boolean
  cancelled: boolean
  cancelledReason?: string | null
  reviewLink?: { href: string; label: string } | null
}

type PaneDocumentContextValue = {
  doc: RegisteredDocument | null
  setDoc: (doc: RegisteredDocument | null) => void
  onMutated?: (kind: "changed" | "removed") => void
  /** #259 B3: "Archived" everywhere, except queues with a Closed facet, where the toast says
   * where the row went — set by the queue via `PaneFrame`'s `archivedToast` prop. */
  archivedToast: { archived: string; unarchived: string }
}

const PaneDocumentContext = createContext<PaneDocumentContextValue | null>(null)

export function PaneDocumentProvider({ onMutated, archivedToast, children }: {
  onMutated?: (kind: "changed" | "removed") => void
  archivedToast?: { archived: string; unarchived: string }
  children: React.ReactNode
}) {
  const [doc, setDoc] = useState<RegisteredDocument | null>(null)
  return <PaneDocumentContext.Provider value={{ doc, setDoc, onMutated, archivedToast: archivedToast ?? { archived: "Archived", unarchived: "Unarchived" } }}>
    {children}
  </PaneDocumentContext.Provider>
}

/** Called by the embedded `SplitPane` (never the standalone full-mode one — full mode has no
 * frame-level document actions beyond *Open review task*, per #234) to tell the frame around it
 * which document is loaded. Registers on mount, updates on change, clears on unmount. */
export function useRegisterDocumentActions(doc: RegisteredDocument | null) {
  const ctx = useContext(PaneDocumentContext)
  useEffect(() => {
    if (!ctx) return
    ctx.setDoc(doc)
    return () => ctx.setDoc(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, doc?.documentId, doc?.fileId, doc?.filename, doc?.flagged, doc?.archived, doc?.cancelled, doc?.cancelledReason, doc?.reviewLink?.href, doc?.reviewLink?.label])
}

/** Item 1b, 2, 3 of the ⋯ menu — everything above the surface's own items. Nothing renders while
 * no document is registered (loading / missing / error content, S1–S3). */
export function DocumentMenuTopItems() {
  const ctx = useContext(PaneDocumentContext)
  const doc = ctx?.doc
  const [busy, setBusy] = useState<"archive" | "flag" | null>(null)
  if (!doc) return null
  const cancelledHint = doc.cancelled ? "Cancelled invoices are already closed." : undefined

  const toggleArchive = async () => {
    setBusy("archive")
    try {
      const next = !doc.archived
      const result = await archiveDocumentsAction(doc.workspaceId, [doc.documentId], next)
      if (!result.success) { toast.error(result.error || "Could not update this document"); return }
      toast.success(next ? ctx!.archivedToast.archived : ctx!.archivedToast.unarchived)
      ctx?.onMutated?.("changed")
    } catch {
      toast.error("Could not reach the server — nothing changed")
    } finally {
      setBusy(null)
    }
  }

  const toggleFlag = async () => {
    setBusy("flag")
    try {
      const next = !doc.flagged
      const result = await flagDocumentsAction(doc.workspaceId, [doc.documentId], next)
      if (!result.success) { toast.error(result.error || "Could not update the flag"); return }
      toast.success(next ? "Flagged" : "Flag removed")
      ctx?.onMutated?.("changed")
    } catch {
      toast.error("Could not reach the server — nothing changed")
    } finally {
      setBusy(null)
    }
  }

  return <>
    {doc.reviewLink && <PaneMenuItem onClick={undefined}>
      {/* An `<a>` so it behaves like a link (open in new tab, copy link), not a button pretending
          to be one — the same reasoning that keeps Open file and Open in a new tab real links. */}
      <a href={doc.reviewLink.href} className="flex w-full items-center" data-menu-close>{doc.reviewLink.label === "In review" ? "Open review task — in review" : "Open review task"}</a>
    </PaneMenuItem>}
    <PaneMenuItem disabled={doc.cancelled || busy === "archive"} hint={cancelledHint} keepOpen={busy === "archive"} onClick={() => void toggleArchive()}>
      {busy === "archive" ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Archiving…</span> : doc.archived ? "Unarchive" : "Archive"}
    </PaneMenuItem>
    <PaneMenuItem disabled={doc.cancelled || busy === "flag"} hint={cancelledHint} keepOpen={busy === "flag"} onClick={() => void toggleFlag()}>
      {busy === "flag" ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Flagging…</span> : <span className="inline-flex items-center gap-2"><Flag className="h-4 w-4" aria-hidden />{doc.flagged ? "Remove flag" : "Flag for attention"}</span>}
    </PaneMenuItem>
  </>
}

/** Item 5, the last (red) item — opens `DeleteDocumentDialog` once the menu itself has closed and
 * focus is back on the ⋯ trigger, so the dialog's own opener is that button (#259 §5). */
export function DocumentMenuDeleteItem({ onDeleted }: { onDeleted?: () => void }) {
  const ctx = useContext(PaneDocumentContext)
  const doc = ctx?.doc
  const [open, setOpen] = useState(false)
  if (!doc) return null
  const cancelledHint = doc.cancelled ? "Cancelled invoices are already closed." : undefined

  return <>
    <PaneMenuItem tone="red" disabled={doc.cancelled} hint={cancelledHint} onClick={() => window.requestAnimationFrame(() => setOpen(true))}>
      <span className="inline-flex items-center gap-2"><Trash2 className="h-4 w-4" aria-hidden />Delete…</span>
    </PaneMenuItem>
    {open && <DeleteDocumentDialog workspaceId={doc.workspaceId} fileId={doc.fileId} documentId={doc.documentId} filename={doc.filename}
      onOpenChange={setOpen}
      onDeleted={() => { ctx?.onMutated?.("removed"); onDeleted?.() }} />}
  </>
}

/** The confirm-and-delete dialog, extracted from the old standalone `DeleteDocumentButton` so the
 * ⋯ menu and any future bulk caller share one implementation (#259 B1/B4). Handles S13's two
 * branches: a document already deleted by someone else closes quietly; any other error leaves the
 * dialog open with its own error line so the operator can retry without losing the confirm state. */
export function DeleteDocumentDialog({ workspaceId, fileId, documentId, filename, onOpenChange, onDeleted }: {
  workspaceId: string
  fileId: string
  documentId: string
  filename: string
  onOpenChange: (open: boolean) => void
  /** Called once the delete has actually succeeded — the caller closes the pane / refreshes. */
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await deleteDocumentsAction(workspaceId, fileId, [documentId])
      if (!result.success) {
        const message = result.error || "Delete failed"
        if (/not found|already deleted/i.test(message)) {
          toast.error("Already deleted by someone else")
          onOpenChange(false)
          onDeleted()
          return
        }
        setError(message)
        return
      }
      toast.success(`${filename} deleted`)
      onOpenChange(false)
      onDeleted()
    } catch {
      setError("Could not reach the server — nothing was deleted")
    } finally {
      setBusy(false)
    }
  }

  return <ConfirmDialog
    open
    destructive
    busy={busy}
    title="Delete this document?"
    description={`${filename} and every row extracted from it will be removed, along with the stored source file. This cannot be undone.`}
    confirmLabel={busy ? "Deleting…" : "Delete"}
    onConfirm={() => void remove()}
    onCancel={() => onOpenChange(false)}>
    {error && <p role="alert" id={errorId} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
  </ConfirmDialog>
}

export function OpenInNewTabMenuItem({ href }: { href: string }) {
  return <PaneMenuItem onClick={() => window.open(href, "_blank", "noopener")}>
    <span className="inline-flex items-center gap-2"><ExternalLink className="h-4 w-4" aria-hidden />Open in a new tab</span>
  </PaneMenuItem>
}

export { PaneDocumentContext }

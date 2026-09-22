"use client"

import { createContext, useContext, useEffect, useId, useState, type KeyboardEvent } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowRightLeft, ExternalLink, Flag, Loader2, Send, Trash2 } from "lucide-react"
import { PaneMenuItem } from "@/components/queue/detail-pane"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { archiveDocumentsAction, flagDocumentsAction } from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { deleteDocumentsAction, reclassifyDocumentAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { createReviewTaskAction } from "@/app/(app)/workspaces/[workspaceId]/review-actions"
import { DOC_TYPE_SPECS, type DocType } from "@/lib/doc-types"
import { documentDestinationPath } from "@/lib/typed-destinations"
import { withOrigin } from "@/lib/navigation/origin"
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
  /** #297 (map #226): the document's resolved type, and whichever of the three server-guarded
   * preconditions (pending approval, Posted/Paid, PO with matched invoices) blocks a move today —
   * both computed server-side wherever this object is assembled, so `MoveDocumentMenuItem` never
   * re-derives eligibility client-side (lesson docubite#257 B1). Optional until the pane's own
   * assembly is wired (step 5); the Move item stays hidden without `docType`, same as any other
   * item here does without its document. */
  docType?: DocType
  /** #297 §5: the type to exclude from Move's target list — the document's *raw* `docType`
   * column, undefined when it has none (a Library document that only resolves a display type via
   * `resolveDocType`'s legacy-template fallback has no real "current queue" to exclude). Distinct
   * from `docType` above, which drives the Direction row and menu-item visibility off the
   * resolved type. */
  currentType?: DocType
  moveDisabledReason?: string | null
  reviewLink?: { href: string; label: string } | null
  /** #258: who decided this document's approval, once the pane's detail load knows — upgrades
   * the Status line's row-derived sentence (e.g. "Approved") to name the actor ("Approved by
   * Nadia K."). Null until the detail loads, or when the state has no actor to show. */
  decision?: { kind: "approved" | "rejected"; actorName: string | null; at: string } | null
}

type PaneDocumentContextValue = {
  doc: RegisteredDocument | null
  setDoc: (doc: RegisteredDocument | null) => void
  onMutated?: (kind: "changed" | "removed") => void
  /** #259 B3: "Archived" everywhere, except queues with a Closed facet, where the toast says
   * where the row went — set by the queue via `PaneFrame`'s `archivedToast` prop. */
  archivedToast: { archived: string; unarchived: string }
}

/** Exported so `StatusLine` (#258) can read `doc.decision` directly for the pane's actor upgrade
 * — the one other reader of this context besides the ⋯ menu items in this file. */
export const PaneDocumentContext = createContext<PaneDocumentContextValue | null>(null)

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
  // Depend on the stable `setDoc`, never on the context object: the provider builds a new value
  // per render, and registering on it re-ran this effect (clear → set → provider re-render → …)
  // until React cut the loop with "Maximum update depth exceeded" (#257 close).
  const setDoc = useContext(PaneDocumentContext)?.setDoc
  useEffect(() => {
    if (!setDoc) return
    setDoc(doc)
    return () => setDoc(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setDoc, doc?.documentId, doc?.fileId, doc?.filename, doc?.flagged, doc?.archived, doc?.cancelled, doc?.cancelledReason, doc?.docType, doc?.moveDisabledReason, doc?.reviewLink?.href, doc?.reviewLink?.label, doc?.decision?.kind, doc?.decision?.actorName, doc?.decision?.at])
}

/** Item 1b, 2, 3 of the ⋯ menu — everything above the surface's own items. Nothing renders while
 * no document is registered (loading / missing / error content, S1–S3). */
/** `closeMenu`: the frame closes its ⋯ once a busy item has resolved (success or failure), so focus
 * returns to the trigger and the toast is the only thing that moves (S10). */
export function DocumentMenuTopItems({ closeMenu }: { closeMenu?: () => void }) {
  const ctx = useContext(PaneDocumentContext)
  const doc = ctx?.doc
  const [busy, setBusy] = useState<"archive" | "flag" | null>(null)
  if (!doc) return null
  const cancelledHint = doc.cancelled ? "Cancelled documents are already closed." : undefined

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
      closeMenu?.()
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
      closeMenu?.()
    }
  }

  return <>
    {doc.reviewLink && <PaneMenuItem href={doc.reviewLink.href}>Open review task</PaneMenuItem>}
    <PaneMenuItem disabled={doc.cancelled} busy={busy === "archive"} hint={cancelledHint} onClick={() => void toggleArchive()}>
      {busy === "archive" ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Archiving…</span> : doc.archived ? "Unarchive" : "Archive"}
    </PaneMenuItem>
    <PaneMenuItem disabled={doc.cancelled} busy={busy === "flag"} hint={cancelledHint} onClick={() => void toggleFlag()}>
      {busy === "flag" ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Flagging…</span> : <span className="inline-flex items-center gap-2"><Flag className="h-4 w-4" aria-hidden />{doc.flagged ? "Remove flag" : "Flag for attention"}</span>}
    </PaneMenuItem>
  </>
}

/** Item 5, the last (red) item — asks its parent to open `DeleteDocumentDialog` once the menu
 * itself has closed, so the dialog's own opener is the ⋯ trigger (#259 §5). The dialog itself
 * must live above the popover's content: Radix unmounts `PopoverContent` (and everything inside
 * it, including this item) the moment the menu closes, which happens on the same click that
 * requests the dialog — so the dialog can't hold its own state here, or it never gets to render. */
export function DocumentMenuDeleteItem({ onRequestDelete }: { onRequestDelete: () => void }) {
  const ctx = useContext(PaneDocumentContext)
  const doc = ctx?.doc
  if (!doc) return null
  const cancelledHint = doc.cancelled ? "Cancelled documents are already closed." : undefined

  return <PaneMenuItem tone="red" disabled={doc.cancelled} hint={cancelledHint} onClick={() => window.requestAnimationFrame(onRequestDelete)}>
    <span className="inline-flex items-center gap-2"><Trash2 className="h-4 w-4" aria-hidden />Delete…</span>
  </PaneMenuItem>
}

/** The confirm-and-delete dialog, extracted from the old standalone `DeleteDocumentButton` so the
 * ⋯ menu and any future bulk caller share one implementation (#259 B1/B4). Handles S13's two
 * branches: a document already deleted by someone else closes quietly; any other error leaves the
 * dialog open with its own error line so the operator can retry without losing the confirm state. */
export function DeleteDocumentDialog({ workspaceId, fileId, documentId, filename, onOpenChange, onDeleted, restoreFocusTo }: {
  workspaceId: string
  fileId: string
  documentId: string
  filename: string
  onOpenChange: (open: boolean) => void
  /** Called once the delete has actually succeeded — the caller closes the pane / refreshes. */
  onDeleted: () => void
  /** See `ConfirmDialog`'s doc — the trigger button, since this mounts after the popover
   * menu that opened it has already unmounted (#297). */
  restoreFocusTo?: React.RefObject<HTMLElement | null>
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
    restoreFocusTo={restoreFocusTo}
    title="Delete this document?"
    description={`${filename} and every row extracted from it will be removed, along with the stored source file. This cannot be undone.`}
    confirmLabel={busy ? "Deleting…" : "Delete"}
    onConfirm={() => void remove()}
    onCancel={() => onOpenChange(false)}>
    {error && <p role="alert" id={errorId} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
  </ConfirmDialog>
}

/** §3's fixed target lists: the three other typed queues (bank statement is not a move target),
 * then the "Other types" sub-list, "found in Search only" (§5). */
const TYPED_MOVE_TARGETS: DocType[] = ["invoice", "receipt", "purchase_order"]
const OTHER_MOVE_TARGETS: DocType[] = ["delivery_note", "contract", "payslip", "tax_form", "other"]
const moveTargetLabel = (docType: DocType) => (docType === "other" ? "Other" : DOC_TYPE_SPECS[docType].label)

/** Requests `MoveDocumentDialog` from its parent, same open-after-menu-closes shape as
 * `DocumentMenuDeleteItem` (#259 §5) — see that item's comment for why the dialog can't hold its
 * own state here. */
export function MoveDocumentMenuItem({ onRequestMove }: { onRequestMove: () => void }) {
  const ctx = useContext(PaneDocumentContext)
  const doc = ctx?.doc
  if (!doc || !doc.docType) return null
  const hint = doc.cancelled ? "Cancelled documents are already closed." : doc.moveDisabledReason || undefined
  const disabled = doc.cancelled || !!doc.moveDisabledReason

  return <PaneMenuItem disabled={disabled} hint={hint} onClick={() => window.requestAnimationFrame(onRequestMove)}>
    <span className="inline-flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" aria-hidden />Move to another queue…</span>
  </PaneMenuItem>
}

/** The confirm-and-move dialog (§3), extracted the same way `DeleteDocumentDialog` is so the ⋯
 * menu is the one caller today and any future one shares it (B1/B4). `currentType` unset means
 * "no current queue to exclude" — Library moving a secondary/untyped document into a typed queue
 * (§5) — so all three typed targets plus every "Other types" option are offered. */
export function MoveDocumentDialog({ workspaceId, documentId, filename, currentType, onOpenChange, onMoved, restoreFocusTo }: {
  workspaceId: string
  documentId: string
  filename: string
  currentType?: DocType
  onOpenChange: (open: boolean) => void
  /** See `ConfirmDialog`'s doc — the trigger button, since this mounts after the popover
   * menu that opened it has already unmounted (#297). */
  restoreFocusTo?: React.RefObject<HTMLElement | null>
  /** Called once the move has actually succeeded — the caller drops the row / refreshes. */
  onMoved: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [target, setTarget] = useState<DocType | null>(null)
  const [otherExpanded, setOtherExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  const typedOptions = TYPED_MOVE_TARGETS.filter((docType) => docType !== currentType)
  const otherOptions = OTHER_MOVE_TARGETS.filter((docType) => docType !== currentType)

  // Same "arrow movement is selection" model as split-pane's Direction radiogroup (§2, B4 reuse):
  // moving focus with an arrow key both focuses and selects that radio.
  const onGroupKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'))
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (index < 0) return
    event.preventDefault()
    const next = items[(index + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length]
    next.focus()
    next.click()
  }

  const selectOption = (docType: DocType) => setTarget(docType)

  const radio = (docType: DocType) => {
    const checked = target === docType
    return <button key={docType} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1}
      onClick={() => selectOption(docType)}
      className={`w-full rounded-md border px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${checked ? "border-emerald-700 bg-emerald-50 font-medium text-emerald-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
      {moveTargetLabel(docType)}
    </button>
  }

  const targetLabel = target ? moveTargetLabel(target) : null
  const currentLabel = currentType ? moveTargetLabel(currentType) : null
  const consequence = targetLabel
    ? currentLabel
      ? `${filename} leaves ${currentLabel} and opens on ${targetLabel}. Extracted fields are kept.`
      : `${filename} opens on ${targetLabel}. Extracted fields are kept.`
    : null

  const move = async () => {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      const result = await reclassifyDocumentAction(workspaceId, documentId, target)
      if (!result.success) { setError(result.error || "Couldn't move this document"); return }
      const destination = documentDestinationPath(`/workspaces/${workspaceId}`, { id: documentId, docType: target })
      const origin = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`
      toast.success(`Moved to ${targetLabel}`, { action: { label: "Open", onClick: () => router.push(withOrigin(destination, origin)) } })
      onOpenChange(false)
      onMoved()
    } catch {
      setError(`Couldn't move ${filename}. Try again.`)
    } finally {
      setBusy(false)
    }
  }

  return <ConfirmDialog
    open
    busy={busy}
    restoreFocusTo={restoreFocusTo}
    title="Move to another queue?"
    description={consequence ?? "Choose a queue to move this document to."}
    confirmLabel={targetLabel ? `Move to ${targetLabel}` : "Move"}
    confirmDisabled={!target}
    onConfirm={() => void move()}
    onCancel={() => onOpenChange(false)}>
    <div role="radiogroup" aria-label="Move to" onKeyDown={onGroupKeyDown} className="space-y-1">
      {typedOptions.map(radio)}
      <button type="button" aria-expanded={otherExpanded} onClick={() => setOtherExpanded((v) => !v)}
        className="w-full rounded-md px-3 py-1.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-50">
        Other types {otherExpanded ? "▾" : "▸"}
      </button>
      {otherExpanded && <div className="space-y-1 border-l-2 border-slate-100 pl-3">
        <p className="py-1 text-xs text-slate-500">Found in Search only.</p>
        {otherOptions.map(radio)}
      </div>}
    </div>
    {error && <p role="alert" id={errorId} className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
  </ConfirmDialog>
}

/** #360 §5: same open-after-menu-closes shape as `MoveDocumentMenuItem`/`DocumentMenuDeleteItem` —
 * absent once `doc.reviewLink` is set (that case already shows "Open review task" above, in
 * `DocumentMenuTopItems`). */
export function SendForReviewMenuItem({ onRequestSend }: { onRequestSend: () => void }) {
  const ctx = useContext(PaneDocumentContext)
  const doc = ctx?.doc
  if (!doc || doc.reviewLink) return null

  return <PaneMenuItem onClick={() => window.requestAnimationFrame(onRequestSend)}>
    <span className="inline-flex items-center gap-2"><Send className="h-4 w-4" aria-hidden />Send for review</span>
  </PaneMenuItem>
}

/** Replaces `CreateReviewTaskButton`'s inline form (#360 §5) with the shared `ConfirmDialog` shell,
 * same extraction shape as `DeleteDocumentDialog`/`MoveDocumentDialog`. On success
 * `createReviewTaskAction` already navigates to the new review task, so the dialog closes as a side
 * effect of that navigation — no separate close-then-navigate race. On failure the typed detail is
 * kept (state lives here, not reset) so the operator doesn't retype it. */
export function SendForReviewDialog({ workspaceId, documentId, onOpenChange, restoreFocusTo }: {
  workspaceId: string
  documentId: string
  onOpenChange: (open: boolean) => void
  restoreFocusTo?: React.RefObject<HTMLElement | null>
}) {
  const router = useRouter()
  const [detail, setDetail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await createReviewTaskAction(workspaceId, documentId, detail)
      if (!result.success || !result.data) { setError(result.error || "Could not create a review task"); return }
      toast.success("Sent for review")
      router.push(`/workspaces/${workspaceId}/review/${result.data.id}`)
    } catch {
      setError("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  return <ConfirmDialog
    open
    busy={busy}
    restoreFocusTo={restoreFocusTo}
    title="Send for review"
    description="A teammate will see this in the review inbox."
    confirmLabel="Send"
    onConfirm={() => void submit()}
    onCancel={() => onOpenChange(false)}>
    <Input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Why does this need review? (optional)" disabled={busy} autoFocus />
    {error && <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
  </ConfirmDialog>
}

export function OpenInNewTabMenuItem({ href }: { href: string }) {
  return <PaneMenuItem onClick={() => window.open(href, "_blank", "noopener")}>
    <span className="inline-flex items-center gap-2"><ExternalLink className="h-4 w-4" aria-hidden />Open in a new tab</span>
  </PaneMenuItem>
}


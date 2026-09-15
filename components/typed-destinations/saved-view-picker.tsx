"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronDown, Copy, Pencil, Share2, Trash2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { canEditSavedView, canShareSavedView, filtersEqual, type SavedViewFilters, type SavedViewSummary } from "@/lib/saved-views"

type Action = (formData: FormData) => Promise<void>

/** #201: the saved-views picker — a single dropdown trigger left of the search box, visually
 * distinct in *shape* (a bordered rectangle with a name + chevron) from the pill-shaped
 * removable filter chips beside it. Built on the existing keyboard/screen-reader listbox pattern
 * (WAI-ARIA APG "Listbox Popup"): Popover supplies the focus trap, outside-click, and
 * Escape-to-close-and-return-focus; this component owns the roving-tabindex arrow/Home/End/Enter
 * navigation across `role="option"` rows.
 *
 * Every mutation (create/duplicate/rename/save/share/delete) is a bound server action passed down
 * from the route's page.tsx, matching bills/page.tsx's `preparePaymentRunAction` shape — this
 * component never talks to models/saved-views.ts directly. A thrown action error (most commonly
 * `saved_view_name_taken`, the one truly reachable in-UI failure without a live dev-server pass
 * from `impeccable` to word precisely) surfaces as a toast rather than the page error boundary. */
export function SavedViewPicker({ views, selectedViewId, currentFilters, currentUserId, currentUserRole, createAction, duplicateAction, renameAction, saveFiltersAction, deleteAction, shareAction }: {
  views: SavedViewSummary[]
  selectedViewId: string | null
  currentFilters: SavedViewFilters
  currentUserId: string
  currentUserRole: "owner" | "reviewer" | "member"
  createAction: Action
  duplicateAction: Action
  renameAction: Action
  saveFiltersAction: Action
  deleteAction: Action
  shareAction: Action
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [newViewDraft, setNewViewDraft] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selected = views.find((v) => v.id === selectedViewId) ?? null
  const dirty = !selected || !filtersEqual(selected.filters, currentFilters)
  const canEditSelected = selected ? canEditSavedView(selected, { userId: currentUserId, role: currentUserRole }) : false
  const nameTaken = (name: string, exceptId?: string) => views.some((v) => v.id !== exceptId && v.name.trim().toLowerCase() === name.trim().toLowerCase())

  const filtersField = useMemo(() => new URLSearchParams(currentFilters).toString(), [currentFilters])

  const focusOption = (index: number) => {
    const clamped = Math.max(0, Math.min(views.length - 1, index))
    optionRefs.current[clamped]?.focus()
  }

  const onListboxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = optionRefs.current.findIndex((el) => el === document.activeElement)
    if (event.key === "ArrowDown") { event.preventDefault(); focusOption(currentIndex + 1) }
    else if (event.key === "ArrowUp") { event.preventDefault(); focusOption(currentIndex - 1) }
    else if (event.key === "Home") { event.preventDefault(); focusOption(0) }
    else if (event.key === "End") { event.preventDefault(); focusOption(views.length - 1) }
  }

  const selectView = (view: SavedViewSummary) => {
    setOpen(false)
    const search = new URLSearchParams(view.filters)
    search.set("view", view.id)
    router.push(`?${search.toString()}`)
  }

  const runAction = async (action: Action, formData: FormData, onError?: (message: string) => void) => {
    try {
      await action(formData)
    } catch (error) {
      // Next's redirect() throws internally on the success path (digest starts with
      // "NEXT_REDIRECT") — that's not a failure, just how server actions signal "go here" back
      // through a client-invoked call; only a real thrown Error means the action failed.
      if (error && typeof error === "object" && "digest" in error && typeof (error as { digest?: unknown }).digest === "string" && (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")) throw error
      const message = error instanceof Error && error.message === "saved_view_name_taken"
        ? "A view with that name already exists."
        : "Couldn't save this view. Please try again."
      if (onError) onError(message)
      else toast.error(message)
    }
  }

  return <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-haspopup="listbox" aria-expanded={open}
          className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          {selected ? selected.name : "Views"}
          {dirty && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />}
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div role="listbox" aria-label="Saved views" aria-activedescendant={selected ? `saved-view-option-${selected.id}` : undefined}
          onKeyDown={onListboxKeyDown} className="max-h-80 overflow-y-auto py-1">
          {views.map((view, index) => {
            const isSelected = view.id === selectedViewId
            const canEdit = canEditSavedView(view, { userId: currentUserId, role: currentUserRole })
            const canShare = canShareSavedView(view, { userId: currentUserId })
            const isRenaming = renamingId === view.id
            if (isRenaming) {
              return <form key={view.id} className="flex items-center gap-1 px-2 py-1"
                action={(formData) => {
                  if (nameTaken(renameDraft, view.id)) { setFormError("A view with that name already exists."); return }
                  setRenamingId(null)
                  runAction(renameAction, formData, setFormError).catch(() => {})
                }}>
                <input type="hidden" name="viewId" value={view.id} />
                <input autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} name="name"
                  className="h-7 flex-1 rounded border border-slate-300 px-2 text-xs" onKeyDown={(e) => { if (e.key === "Escape") setRenamingId(null) }} />
                <button type="submit" className="rounded px-1.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">Save</button>
                <button type="button" onClick={() => setRenamingId(null)} className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100">Cancel</button>
              </form>
            }
            return <div key={view.id} className="group flex items-center gap-1 px-1">
              <button ref={(el) => { optionRefs.current[index] = el }} id={`saved-view-option-${view.id}`}
                role="option" aria-selected={isSelected} tabIndex={isSelected || (!selected && index === 0) ? 0 : -1}
                onClick={() => selectView(view)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectView(view) } }}
                className={`flex flex-1 items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm ${isSelected ? "bg-emerald-50 font-medium text-emerald-800" : "text-slate-700 hover:bg-slate-50"}`}>
                <span className="truncate">{view.name}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                  {view.isSystem ? "System" : view.ownerId === null ? "Shared" : view.ownerId === currentUserId ? "Personal" : "Shared by teammate"}
                </span>
              </button>
              <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                <IconAction label={`Duplicate ${view.name}`} icon={Copy} onClick={() => {
                  const name = `${view.name} copy`
                  if (nameTaken(name)) { toast.error("A view with that name already exists — rename it after duplicating."); return }
                  const formData = new FormData()
                  formData.set("sourceViewId", view.id)
                  formData.set("name", name)
                  runAction(duplicateAction, formData).catch(() => {})
                  setOpen(false)
                }} />
                {canEdit && <IconAction label={`Rename ${view.name}`} icon={Pencil} onClick={() => { setRenamingId(view.id); setRenameDraft(view.name); setFormError(null) }} />}
                {canShare && <IconAction label={`Share ${view.name} with the workspace`} icon={Share2} onClick={() => {
                  const formData = new FormData()
                  formData.set("viewId", view.id)
                  runAction(shareAction, formData).catch(() => {})
                  setOpen(false)
                }} />}
                {canEdit && <IconAction label={`Delete ${view.name}`} icon={Trash2} destructive onClick={() => setPendingDeleteId(view.id)} />}
              </div>
            </div>
          })}
        </div>
        {formError && <p className="border-t px-3 py-1.5 text-xs text-red-600">{formError}</p>}
        <div className="border-t p-2">
          {dirty && canEditSelected && selected && (
            <form action={(formData) => { runAction(saveFiltersAction, formData).catch(() => {}) }} className="mb-1.5">
              <input type="hidden" name="viewId" value={selected.id} />
              <input type="hidden" name="filters" value={filtersField} />
              <button type="submit" className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                Save changes to &ldquo;{selected.name}&rdquo;
              </button>
            </form>
          )}
          {dirty && (
            <form className="flex items-center gap-1.5" action={(formData) => {
              if (!newViewDraft.trim()) { setFormError("Give this view a name."); return }
              if (nameTaken(newViewDraft)) { setFormError("A view with that name already exists."); return }
              setFormError(null)
              runAction(createAction, formData, setFormError).catch(() => {})
              setNewViewDraft("")
            }}>
              <input type="hidden" name="filters" value={filtersField} />
              <input value={newViewDraft} onChange={(e) => setNewViewDraft(e.target.value)} name="name" placeholder="Save current filters as…"
                className="h-7 flex-1 rounded border border-slate-300 px-2 text-xs" />
              <button type="submit" className="shrink-0 rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">Save</button>
            </form>
          )}
          {!dirty && <p className="px-1 py-1 text-xs text-slate-400">Showing &ldquo;{selected?.name}&rdquo;</p>}
        </div>
      </PopoverContent>
    </Popover>
    <ConfirmDialog open={pendingDeleteId !== null} title="Delete this view?"
      description="Anyone using this view loses it. This can't be undone."
      confirmLabel="Delete" destructive
      onCancel={() => setPendingDeleteId(null)}
      onConfirm={() => {
        if (!pendingDeleteId) return
        const formData = new FormData()
        formData.set("viewId", pendingDeleteId)
        runAction(deleteAction, formData).catch(() => {})
        setPendingDeleteId(null)
      }} />
  </>
}

function IconAction({ label, icon: Icon, onClick, destructive }: { label: string; icon: typeof Copy; onClick: () => void; destructive?: boolean }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick}
    className={`rounded p-1 ${destructive ? "text-slate-400 hover:bg-red-50 hover:text-red-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>
    <Icon className="h-3.5 w-3.5" />
  </button>
}

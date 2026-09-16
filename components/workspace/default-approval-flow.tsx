"use client"

import { estimateAutoStartsAction, setDefaultApprovalFlowAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { AdminSaveBar } from "@/components/admin/admin-save-bar"
import { Consequence } from "@/components/admin/admin-ui"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { STALE_FLOW_ERROR } from "@/lib/approvals/default-flow"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useId, useRef, useState } from "react"

export type DefaultFlowOption = { id: string; name: string; active: boolean; stageCount: number }

const NONE = "none"

/** #253: the Default flow selector on Admin › Approval Flows.
 *
 * Off by default, and the consequence sentence says what "off" means rather than leaving the
 * reader to infer it from an unset control. Turning it ON goes through the confirm-with-30-day-
 * estimate pattern — a setting that will start work on its own has to say how much work that
 * would have been. Turning it OFF does not: reversal is cheap and the consequence of stopping is
 * the state the workspace shipped in, so a confirm there would be friction with nothing behind it
 * (Intent: easy reversal, friction proportional to consequence).
 *
 * One `AdminSaveBar`, like every other Admin form — nothing applies on selection. */
export function DefaultApprovalFlow({ workspaceId, options, currentId, readOnly = false }: {
  workspaceId: string
  options: DefaultFlowOption[]
  currentId: string | null
  readOnly?: boolean
}) {
  const router = useRouter()
  const groupId = useId()
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  const [saved, setSaved] = useState<string>(currentId ?? NONE)
  const [choice, setChoice] = useState<string>(currentId ?? NONE)
  const [pending, setPending] = useState(false)
  const [counting, setCounting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<{ name: string; active: boolean; estimate: number | null } | null>(null)

  // The server is the truth for what is in force: when the row actions below change it (the
  // default flow deleted → SetNull, or another session chose one) and the page refreshes, the
  // selector and its sentence follow, rather than keeping a value the server no longer holds.
  // An unsaved choice survives the resync; a choice that merely mirrored the old saved value moves
  // with it.
  useEffect(() => {
    const next = currentId ?? NONE
    setChoice((previous) => (previous === saved ? next : previous))
    setSaved(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync on the server value only
  }, [currentId])

  const dirty = choice !== saved
  const clearSaved = useCallback(() => setSavedAt(null), [])
  const chosen = options.find((option) => option.id === choice) ?? null
  const savedOption = options.find((option) => option.id === saved) ?? null

  const commit = async (next: string) => {
    setPending(true); setError(null); setStale(false)
    try {
      const result = await setDefaultApprovalFlowAction(workspaceId, next === NONE ? null : next)
      if (!result.success) {
        // The dialog closes on a refusal so the sentence in the bar is in front of the reader,
        // not behind a modal that looks as if Confirm did nothing.
        closeConfirm()
        setStale(result.error === STALE_FLOW_ERROR)
        setError(`Couldn't save — ${result.error || "the server didn't say why"}. Your change is still here.`)
        return
      }
      setSaved(next); setSavedAt(Date.now()); closeConfirm()
      router.refresh()
    } catch {
      closeConfirm()
      setError("Couldn't reach the server. Your change is still here.")
    } finally { setPending(false) }
  }

  const save = async () => {
    // Clearing the default needs no confirm — it returns the workspace to starting approvals by hand.
    if (choice === NONE) { await commit(NONE); return }
    if (!chosen) return
    setCounting(true); setError(null)
    const result = await estimateAutoStartsAction(workspaceId)
    setCounting(false)
    // An estimate that cannot be counted must not block the decision: the dialog still opens and
    // says the number is unavailable, rather than trapping the owner behind a failed count.
    setConfirm({ name: chosen.name, active: chosen.active, estimate: result.success ? (result.data?.count ?? null) : null })
  }

  const discard = () => { setChoice(saved); setError(null); setStale(false) }
  // The confirm opens from a Save that is disabled while it counts, so the dialog records no
  // opener; focus comes back here explicitly when it closes for any reason.
  const closeConfirm = () => { setConfirm(null); window.requestAnimationFrame(() => saveButtonRef.current?.focus()) }
  const bulkBar = <Link href={`/workspaces/${workspaceId}/invoices`} className="font-medium text-emerald-700 underline-offset-2 hover:underline">Invoices bulk bar</Link>

  if (!options.length) {
    return <div>
      <Consequence>
        There are no flows to make the default yet. Add one below, then come back here to have it
        start on its own. Until then, approvals start by hand from the Invoices bulk bar.
      </Consequence>
    </div>
  }

  return <div>
    <fieldset disabled={readOnly || pending || counting}>
      <legend className="sr-only">Default approval flow</legend>
      <div className="divide-y divide-hairline-soft">
        <Row
          name={groupId}
          value={NONE}
          checked={choice === NONE}
          onSelect={setChoice}
          label="No default — approvals start by hand"
          detail="Someone picks a flow from the Invoices bulk bar, one batch at a time."
        />
        {options.map((option) => (
          <Row
            key={option.id}
            name={groupId}
            value={option.id}
            checked={choice === option.id}
            onSelect={setChoice}
            label={option.name}
            detail={`${option.stageCount} stage${option.stageCount === 1 ? "" : "s"}.${option.active ? "" : " Inactive — an inactive flow never starts on its own."}`}
          />
        ))}
      </div>
    </fieldset>

    <div className="mt-4">
      {/* Two sentences while a change is pending — what is in force now, and what Save would make
        * true — so the selected radio and the sentence beneath it never contradict each other. */}
      <Consequence>
        {dirty && <span className="font-medium text-slate-900">In force now: </span>}
        {saved === NONE || !savedOption
          ? <>No flow starts on its own. Approvals start by hand from the {bulkBar}.</>
          : !savedOption.active
            ? <>
                <span className="font-medium text-amber-800">&ldquo;{savedOption.name}&rdquo; is the default but is inactive, so nothing starts on its own.</span>{" "}
                {readOnly ? "An owner can make it active or choose another flow." : "Make it active in the list below, or choose another flow."}
              </>
            : <>&ldquo;{savedOption.name}&rdquo; starts on its own when an invoice reaches In review with no blocking check. Invoices already being reviewed are left as they are.</>}
      </Consequence>
      {dirty && <Consequence>
        <span className="font-medium text-slate-900">After you save: </span>
        {choice === NONE || !chosen
          ? "no flow starts on its own; approvals start by hand again."
          : !chosen.active
            ? <>&ldquo;{chosen.name}&rdquo; becomes the default but is inactive, so nothing starts on its own until it is activated.</>
            : <>&ldquo;{chosen.name}&rdquo; starts on its own when an invoice reaches In review with no blocking check.</>}
      </Consequence>}
    </div>

    <AdminSaveBar
      dirty={dirty} pending={pending || counting} pendingLabel={counting ? "Counting…" : undefined}
      error={error} savedAt={savedAt} disabled={readOnly} shortcut={confirm === null} saveButtonRef={saveButtonRef}
      errorAction={stale ? { label: "Reload", onClick: () => { setError(null); setStale(false); router.refresh() } } : undefined}
      onSave={() => void save()} onDiscard={discard} onSavedShown={clearSaved} />

    <ConfirmDialog
      open={confirm !== null}
      busy={pending}
      title={confirm ? `Make “${confirm.name}” the default flow?` : ""}
      description={confirm
        ? !confirm.active
          ? `“${confirm.name}” is inactive, so nothing starts on its own until it is activated in the list below. Once it is active, an invoice reaching In review with no blocking check starts it on its own. Invoices already being reviewed are left as they are.`
          : confirm.estimate === null
          ? `From now on, an invoice reaching In review with no blocking check starts “${confirm.name}” on its own. Invoices already being reviewed are left as they are. We couldn't count how many of the last 30 days' invoices this would have covered.`
          : confirm.estimate === 0
            ? `From now on, an invoice reaching In review with no blocking check starts “${confirm.name}” on its own. No invoice in the last 30 days would have started a flow automatically. Invoices already being reviewed are left as they are.`
            : `From now on, an invoice reaching In review with no blocking check starts “${confirm.name}” on its own. In the last 30 days, ${confirm.estimate} invoice${confirm.estimate === 1 ? "" : "s"} would have started one this way. Invoices already being reviewed are left as they are.`
        : ""}
      confirmLabel={pending ? "Saving…" : "Make it the default"}
      onConfirm={() => void commit(choice)}
      onCancel={closeConfirm} />
  </div>
}

/** One ruled choice. A real radio input, not a styled div: the whole row is the label, so the
 * click target is the row and the keyboard arrow keys move between options the way a radio group
 * is expected to. */
function Row({ name, value, checked, onSelect, label, detail }: {
  name: string
  value: string
  checked: boolean
  onSelect: (value: string) => void
  label: string
  detail: string
}) {
  return <label className="flex cursor-pointer items-start gap-3 py-3 first:pt-0">
    <input
      type="radio"
      name={name}
      value={value}
      checked={checked}
      onChange={() => onSelect(value)}
      className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-700"
    />
    <span className="min-w-0">
      <span className="block text-sm text-slate-900">{label}</span>
      <span className="mt-0.5 block max-w-[56ch] text-xs leading-relaxed text-slate-500">{detail}</span>
    </span>
  </label>
}

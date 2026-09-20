"use client"

import { useEffect, useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import { openKeyboardShortcutsDialog } from "@/components/shell/keyboard-shortcuts"

const OPEN_EVENT = "docubite:open-how-it-works"

/** #264 spec §3.5: the account-menu item dispatches this the same way the Keyboard shortcuts
 * item does — the dialog host is mounted once in `Sidebar`, the opener lives in `AccountMenu`.
 * Called *after* the menu's `close()` has returned focus to the account chip, so the shared
 * `Dialog` records the chip as its opener and Esc lands there, never on `body`. */
export function openHowItWorksDialog() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** Phone opener (spec §6 row 15): below md the account menu is the Account page (#252), so the
 * same dialog opens from a panel there. Plain text button in the page's link family; it is the
 * opener the shared `Dialog` returns focus to on Esc. */
export function HowItWorksButton() {
  return <button type="button" onClick={openHowItWorksDialog}
    className="inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline-offset-2 hover:underline">
    Open How DocuBite works
  </button>
}

const STEPS: { name: string; sentence: string }[] = [
  { name: "Add", sentence: "Drop invoices on the queue, add them with Add invoices, or email them to the company's address." },
  { name: "In review", sentence: "DocuBite extracts each one into a row. Open it to check the fields beside the source." },
  { name: "Approve", sentence: "Approve it yourself or start an approval flow; Needs attention marks anything a check blocked." },
  { name: "Post", sentence: "Post the approved invoice to your ledger. It stays on the queue as a Posted row." },
]

/** The one help surface that replaces the welcome tour on the account menu (#241 d.8). A read,
 * not a form: centred at every width, nothing stored, nothing to dismiss but the dialog. */
export function HowItWorksDialog() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])
  const close = () => setOpen(false)
  return <Dialog open={open} onClose={close} title="How DocuBite works" width="max-w-md">
    <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
      {/* The sequence is the information, so the numerals are earned (craft-floor). */}
      <ol className="mt-1 space-y-3 text-sm text-slate-700">
        {STEPS.map((step, index) => <li key={step.name} className="flex gap-3">
          <span aria-hidden className="w-5 shrink-0 text-right tabular-nums text-slate-400">{index + 1}</span>
          <span><strong className="font-semibold text-slate-900">{step.name}</strong> — {step.sentence}</span>
        </li>)}
      </ol>
      <p className="mt-4 border-t border-hairline pt-3 text-[13px] text-slate-500">
        <button type="button" className="font-medium text-emerald-700 hover:underline"
          onClick={() => { close(); openKeyboardShortcutsDialog() }}>Keyboard shortcuts</button> are under the account menu, or press ?
      </p>
    </div>
  </Dialog>
}

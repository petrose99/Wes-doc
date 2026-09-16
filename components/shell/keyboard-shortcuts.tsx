"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Dialog } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { DETAIL_PANE_ID } from "@/components/queue/detail-pane"
import { isKeyboardShortcutsEnabled, setKeyboardShortcutsEnabled, useKeyboardShortcutsEnabled } from "@/lib/shell/keyboard-shortcuts"

export type ShortcutDestination = { key: string; label: string; href: string }

/** Rail-order destinations for the `g ‹letter›` jumps and the dialog's "Go to" group (spec §2,
 * §3.5). One letter, one landing — an item not on the rail today has no key. */
export const SHORTCUT_DESTINATIONS = (workspaceId: string, adminHref: string): ShortcutDestination[] => {
  const base = `/workspaces/${workspaceId}`
  return [
    { key: "i", label: "Invoices", href: `${base}/invoices` },
    { key: "p", label: "Purchase Orders", href: `${base}/purchase-orders` },
    { key: "r", label: "Receipts", href: `${base}/receipts` },
    { key: "b", label: "Bank Statements", href: `${base}/bank-statements` },
    { key: "e", label: "Exceptions", href: `${base}/exceptions` },
    { key: "a", label: "Approvals (Invoices)", href: `${base}/approvals/invoices` },
    { key: "y", label: "Payments (Bill Pay)", href: `${base}/payments/bill-pay` },
    { key: "d", label: "Admin", href: adminHref },
  ]
}

const OPEN_EVENT = "docubite:open-keyboard-shortcuts"
const PENDING_FOCUS_KEY = "docubite.pendingFocus"

/** The account-menu item dispatches this rather than reaching into `Sidebar`'s state — the host
 * lives in `Sidebar` (it owns the rail item list, §2), the menu item lives in `AccountMenu`; a
 * custom event avoids prop-drilling the opener through a component that has no other reason to
 * know about it. */
export function openKeyboardShortcutsDialog() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex items-center justify-center rounded-[4px] border border-hairline bg-white px-1.5 py-0.5 font-mono text-[12px] leading-none text-slate-700">{children}</kbd>
}

function Sequence({ first, second }: { first: string; second: string }) {
  return <span aria-label={`${first} then ${second}`} className="inline-flex items-center gap-1"><Kbd>{first}</Kbd><Kbd>{second}</Kbd></span>
}

/** Registered once by `Sidebar` (§2). Owns the single `keydown` listener, the pending-`g` state
 * and the dialog's open state — `?` and the account-menu item share one `open` so only one dialog
 * can ever be up. Desktop-gated: below `md` the listener never attaches (§3.3). */
export function KeyboardShortcuts({ destinations }: { destinations: ShortcutDestination[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const enabled = useKeyboardShortcutsEnabled()
  const [open, setOpen] = useState(false)
  const pendingRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const clearPending = useCallback(() => {
    pendingRef.current = false
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  // A route change mid-sequence, or while the dialog sits over a page the operator has since left,
  // resolves both rather than leaving either stranded (spec B6).
  useEffect(() => { clearPending(); setOpen(false) }, [pathname, clearPending])

  // Admin has no queue list to consume PENDING_FOCUS_KEY="rows" (only queue-screen.tsx and
  // search-client.tsx do), so `g d` lands here instead: a "main" flag this effect claims itself
  // once the route change that follows router.push has actually landed.
  useEffect(() => {
    if (window.sessionStorage.getItem(PENDING_FOCUS_KEY) !== "main") return
    window.sessionStorage.removeItem(PENDING_FOCUS_KEY)
    document.getElementById("main")?.focus()
  }, [pathname])

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)")
    if (!mql.matches) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=alertdialog], [role=listbox], [role=menu], [role=radiogroup]")) return

      if (pendingRef.current) {
        clearPending()
        if (!isKeyboardShortcutsEnabled()) return
        const destination = destinations.find((entry) => entry.key === event.key)
        if (!destination) return
        event.preventDefault()
        const focusFlag = destination.label === "Admin" ? "main" : "rows"
        window.sessionStorage.setItem(PENDING_FOCUS_KEY, focusFlag)
        if (pathname === destination.href) {
          if (focusFlag === "main") { window.sessionStorage.removeItem(PENDING_FOCUS_KEY); document.getElementById("main")?.focus() }
          else window.dispatchEvent(new Event("docubite:focus-rows"))
        } else router.push(destination.href)
        return
      }

      // `?` (open the dialog) stays reachable even while shortcuts are off — it's how the switch
      // itself gets turned back on (§3.3) — everything else below requires them enabled.
      if (event.key === "?") { event.preventDefault(); setOpen((current) => !current); return }
      if (!isKeyboardShortcutsEnabled()) return

      if (event.key === "g") { pendingRef.current = true; timerRef.current = window.setTimeout(clearPending, 1500); return }
      if (event.key === "/") {
        event.preventDefault()
        const base = pathname.split("/").slice(0, 3).join("/")
        window.sessionStorage.setItem(PENDING_FOCUS_KEY, "search")
        router.push(`${base}/search`)
        return
      }
      if (event.key === "f") {
        event.preventDefault()
        const chip = document.querySelector<HTMLElement>("#queue-facets button")
        ;(chip ?? document.getElementById("queue-title"))?.focus()
        return
      }
      if (event.key === "]" || event.key === "[") {
        event.preventDefault()
        const pane = document.getElementById(DETAIL_PANE_ID)
        const buttons = pane ? [...pane.querySelectorAll<HTMLElement>('button[aria-label^="Does not match the PO"]')] : []
        if (buttons.length === 0) return
        const active = document.activeElement as HTMLElement | null
        const index = active ? buttons.indexOf(active) : -1
        const delta = event.key === "]" ? 1 : -1
        const next = buttons[(index + delta + buttons.length) % buttons.length] ?? buttons[0]
        next.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [destinations, pathname, router, clearPending])

  return <KeyboardShortcutsDialog open={open} onClose={() => setOpen(false)} destinations={destinations} enabled={enabled} />
}

function KeyboardShortcutsDialog({ open, onClose, destinations, enabled }: { open: boolean; onClose: () => void; destinations: ShortcutDestination[]; enabled: boolean }) {
  return <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" width="max-w-lg"
    description="Letters work when you are not typing in a field. Arrows and Enter always work.">
    <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">Go to</h3>
          <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
            {destinations.map((destination) => <RowPair key={destination.key} label={destination.label} keys={<Sequence first="g" second={destination.key} />} />)}
            <RowPair label="Search" keys={<Kbd>/</Kbd>} />
          </div>
        </div>
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">In a queue</h3>
          <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
            <RowPair label="Next or previous row" keys={<span className="flex gap-1"><Kbd>↓</Kbd><Kbd>↑</Kbd></span>} />
            <RowPair label="First or last row" keys={<span className="flex gap-1"><Kbd>Home</Kbd><Kbd>End</Kbd></span>} />
            <RowPair label="Open the row" keys={<Kbd>Enter</Kbd>} />
            <RowPair label="Select the row" keys={<span className="flex gap-1"><Kbd>←</Kbd><Kbd>Space</Kbd></span>} />
            <RowPair label="Filters" keys={<Kbd>f</Kbd>} />
          </div>
          <h3 className="mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">In the Detail pane</h3>
          <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
            <RowPair label="Next or previous row" keys={<span className="flex gap-1"><Kbd>↓</Kbd><Kbd>↑</Kbd></span>} />
            <RowPair label="Close" keys={<Kbd>Esc</Kbd>} />
            <RowPair label="Next or previous mismatch — Invoices with a PO" keys={<span className="flex gap-1"><Kbd>]</Kbd><Kbd>[</Kbd></span>} />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-hairline pt-4">
        <span>
          <label id="keyboard-shortcuts-switch-label" className="block text-sm font-medium text-slate-800">Keyboard shortcuts</label>
          <span id="keyboard-shortcuts-switch-help" className="mt-0.5 block text-xs text-slate-500">Turn off if a key fires while you dictate or use a screen reader.</span>
        </span>
        <Switch checked={enabled} onCheckedChange={setKeyboardShortcutsEnabled} label="Keyboard shortcuts" describedBy="keyboard-shortcuts-switch-help" />
      </div>
    </div>
  </Dialog>
}

function RowPair({ label, keys }: { label: string; keys: React.ReactNode }) {
  return <><span className="py-1 text-sm text-slate-800">{label}</span><span className="py-1 text-right text-sm text-slate-400">{keys}</span></>
}

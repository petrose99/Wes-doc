"use client"

import { useSignOut } from "@/components/shell/sign-out-button"
import { openKeyboardShortcutsDialog } from "@/components/shell/keyboard-shortcuts"
import { openHowItWorksDialog } from "@/components/shell/how-it-works"
import { openApprovalEmailsDialog } from "@/components/shell/approval-emails"
import { useKeyboardShortcutsEnabled } from "@/lib/shell/keyboard-shortcuts"
import { accountPaths } from "@/lib/admin/paths"
import { ChevronsUpDown, CircleHelp, Keyboard, LogOut, Mail, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

/** The rail's account chip and its menu. #231 Q10 (#252): account-level items live here, not in
 * a company's Admin — Security (MFA, sessions) and the two help surfaces — beside the everyday
 * sign-out. "Sign out everywhere" stays on Security, where its weight belongs. */
export function AccountMenu({ name, email, collapsed = false, workspaceId, approvalEmails = true }: { name: string; email: string; collapsed?: boolean; workspaceId?: string; /** #271: the saved "Approval emails" value, for the row's Off suffix. */ approvalEmails?: boolean }) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)") ?? [])]
  // evaluate H7 (#252): role="menu" promises menu keys. Open puts focus on the first item, ↑/↓
  // and Home/End move within it, Escape closes and hands focus back to the chip.
  const close = (refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus() }
  const { busy, signOut } = useSignOut()
  const shortcutsEnabled = useKeyboardShortcutsEnabled()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false) }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return }
      if (event.key === "Tab") { close(false); return }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
      const list = items()
      if (list.length === 0) return
      event.preventDefault()
      const index = list.indexOf(document.activeElement as HTMLElement)
      const next = event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : event.key === "ArrowDown" ? (index + 1) % list.length : (index - 1 + list.length) % list.length
      list[next]?.focus()
    }
    items()[0]?.focus()
    window.addEventListener("mousedown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => { window.removeEventListener("mousedown", onPointerDown); window.removeEventListener("keydown", onKeyDown) }
  }, [open])

  const initial = (name || email).trim().charAt(0).toUpperCase() || "?"
  const itemClass = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none disabled:opacity-50"

  return <div ref={wrapper} className="relative">
    <button ref={trigger} id="account-menu-trigger" type="button" className="flex w-full items-center gap-2 border border-transparent rounded-lg px-2 py-2 text-left transition-[background-color,border-color,box-shadow] duration-150 hover:border-[#dbe3ea] hover:bg-white hover:shadow-[0_1px_3px_rgba(15,23,42,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} aria-label={collapsed ? "Account menu" : undefined}>
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-emerald-700 text-xs font-bold text-white">{initial}</span>
      {!collapsed && <>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-800">{name || email}</span>
          {name && <span className="block truncate text-xs text-slate-500">{email}</span>}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </>}
    </button>
    {open && <div ref={menu} role="menu" aria-label="Account" className="absolute bottom-full left-0 z-50 mb-1 w-full min-w-56 overflow-hidden rounded-md border border-hairline bg-white py-1 shadow-lg">
      <div className="border-b border-hairline px-3 py-2">
        <p className="truncate text-sm font-medium text-slate-800">{name || email}</p>
        <p className="truncate text-xs text-slate-500">{email}</p>
      </div>
      {workspaceId && <>
        <Link role="menuitem" href={accountPaths(workspaceId).security} className={itemClass} onClick={() => close(false)}>
          <ShieldCheck className="h-4 w-4" aria-hidden />Security
        </Link>
        {/* #264 spec §3.5: close() first so focus is back on the chip when the dialog records its opener. */}
        <button type="button" role="menuitem" className={itemClass} onClick={() => { close(); openHowItWorksDialog() }}>
          <CircleHelp className="h-4 w-4" aria-hidden />How DocuBite works
        </button>
        <button type="button" role="menuitem" className={itemClass} aria-label={shortcutsEnabled ? "Keyboard shortcuts" : "Keyboard shortcuts, off"}
          onClick={() => { close(); openKeyboardShortcutsDialog() }}>
          <Keyboard className="h-4 w-4" aria-hidden /><span className="flex-1">Keyboard shortcuts</span>
          {!shortcutsEnabled && <span className="text-xs text-slate-500">Off</span>}
        </button>
        {/* #271 spec §4: the Approval-emails switch lives in a dialog (host in Sidebar); the row shows the saved state. */}
        <button type="button" role="menuitem" className={itemClass} aria-label={approvalEmails ? "Approval emails" : "Approval emails, off"}
          onClick={() => { close(); openApprovalEmailsDialog() }}>
          <Mail className="h-4 w-4" aria-hidden /><span className="flex-1">Approval emails</span>
          {!approvalEmails && <span className="text-xs text-slate-500">Off</span>}
        </button>
        <div className="my-1 border-t border-hairline" aria-hidden />
      </>}
      <button type="button" role="menuitem" className={itemClass} disabled={busy} onClick={() => void signOut()}>
        <LogOut className="h-4 w-4" aria-hidden />{busy ? "Signing out…" : "Sign out"}
      </button>
    </div>}
  </div>
}

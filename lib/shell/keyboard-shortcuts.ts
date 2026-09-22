"use client"

import { useSyncExternalStore } from "react"

/** #262: the single on/off switch for the keyboard shortcut set (roving rows are always on —
 * this only gates the letter/`g`-sequence keys). `localStorage` mirrors across tabs via the
 * native `storage` event; a custom event mirrors the switch and the account-menu "Off" label
 * inside the same tab in the same tick (spec B2). Private-mode throws fall back to an in-memory
 * flag for the session — the switch still works, it just doesn't persist. */
const KEY = "docubite.keyboardShortcuts"
const EVENT = "docubite:keyboard-shortcuts-changed"

let memoryEnabled = true
let memoryFallback = false

export function isKeyboardShortcutsEnabled(): boolean {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(KEY) !== "off"
  } catch {
    memoryFallback = true
    return memoryEnabled
  }
}

export function setKeyboardShortcutsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, enabled ? "on" : "off")
  } catch {
    memoryFallback = true
    memoryEnabled = enabled
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback)
  window.addEventListener(EVENT, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(EVENT, callback)
  }
}

export function useKeyboardShortcutsEnabled(): boolean {
  return useSyncExternalStore(subscribe, isKeyboardShortcutsEnabled, () => true)
}

export function keyboardShortcutsFellBackToMemory(): boolean {
  return memoryFallback
}

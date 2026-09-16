import { describe, expect, it } from "vitest"
import { isKeyboardShortcutsEnabled, setKeyboardShortcutsEnabled } from "./keyboard-shortcuts"

// No jsdom in this repo's vitest setup (node environment only) — the store's `typeof window`
// guards are exactly what let it run here at all; this only proves the SSR path (spec: "SSR
// snapshot = on"). The client toggle/storage-event/fallback behaviour is covered by the keyboard
// probe in the measure phase's capture round instead.
describe("keyboard shortcuts store (SSR)", () => {
  it("defaults to on when there is no window", () => {
    expect(isKeyboardShortcutsEnabled()).toBe(true)
  })

  it("setKeyboardShortcutsEnabled is a no-op without a window", () => {
    expect(() => setKeyboardShortcutsEnabled(false)).not.toThrow()
    expect(isKeyboardShortcutsEnabled()).toBe(true)
  })
})

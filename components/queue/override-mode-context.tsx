"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

/** #203's Override Mode, re-homed for the Queue screen (#225). Still a client-side UI mode scoped
 * to the screen that mounted it — never a server session — and still auto-exits on navigation
 * because the provider unmounts with the screen. It became a Context here because the toggle
 * now lives in the header's overflow menu while the control it gates (the Checks tab's Override
 * button) renders inside server-action-returned detail content several levels down; threading a
 * prop through a server-rendered subtree isn't possible, so this is the fan-out a Context is for. */
type OverrideMode = { active: boolean; toggle: () => void }

const OverrideModeContext = createContext<OverrideMode>({ active: false, toggle: () => {} })

export function OverrideModeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  return <OverrideModeContext.Provider value={{ active, toggle: () => setActive((current) => !current) }}>{children}</OverrideModeContext.Provider>
}

export function useOverrideMode(): OverrideMode {
  return useContext(OverrideModeContext)
}

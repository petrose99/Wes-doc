"use client"

import { AssistantPanel } from "@/components/assistant/assistant-panel"
import { Sparkles } from "lucide-react"
import { useRef, useState } from "react"

const CLOSE_INTENTS = [
  "What is blocking the lock right now?",
  "Walk me through the accrual proposals",
  "Which suppliers drive the AP aging?",
]

/** #97: the close page's assistant — the same panel the other surfaces embed, docked as a
 * right-hand drawer, with surface "close" and a server-built preamble summarising the
 * computed items (lib/close/preamble.ts) so the conversation opens with the numbers instead
 * of a blank box. */
export function CloseAssistant({ workspaceId, preamble }: { workspaceId: string; preamble: string }) {
  const [open, setOpen] = useState(false)
  const apiRef = useRef(null)

  if (!open) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
        onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" />
        AI Assistant
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-900"
        onClick={() => setOpen(false)}>
        <Sparkles className="h-4 w-4" />
        Hide assistant
      </button>
      <AssistantPanel
        workspaceId={workspaceId}
        apiRef={apiRef}
        onClose={() => setOpen(false)}
        surface="close"
        title="Close assistant"
        intents={CLOSE_INTENTS}
        emptyHint="Ask about any checklist line — the assistant walks you through the close as a working paper, not advice."
        preamble={preamble}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-slate-200 bg-slate-50 shadow-2xl"
      />
    </>
  )
}

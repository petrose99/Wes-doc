"use client"

/** #77: the sign-off form for one close item.
 *
 * Firm mode is a plain single-button form — the reviewer's identity IS the accountability.
 * SMB mode renders the versioned attestation checkbox above the button and disables submit
 * until it is ticked; the checkbox posts as `attestation=on` and the server action re-derives
 * the actual text/version from source (so a tampered client can't submit an arbitrary string).
 * The label difference — "Sign off as reviewer" vs "Sign off as signer of record" — comes from
 * the parent page, since it also knows whether this is a first sign or a re-sign. */

import { useId, useState } from "react"
import { signCloseItemAction } from "./actions"
import { SMB_ATTESTATION_TEXT_V1 } from "@/lib/close/attestation"

export function SignForm({ workspaceId, itemId, isSmb, label }: {
  workspaceId: string
  itemId: string
  isSmb: boolean
  label: string
}) {
  const checkboxId = useId()
  const [ticked, setTicked] = useState(false)
  const disabled = isSmb && !ticked

  return (
    <form action={signCloseItemAction.bind(null, workspaceId, itemId)} className="flex flex-col items-end gap-2">
      {isSmb && (
        <label htmlFor={checkboxId} className="flex max-w-md items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <input
            id={checkboxId}
            name="attestation"
            type="checkbox"
            required
            checked={ticked}
            onChange={(event) => setTicked(event.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-amber-400 text-amber-700 focus:ring-amber-500"
          />
          <span className="leading-snug">{SMB_ATTESTATION_TEXT_V1}</span>
        </label>
      )}
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300"
      >
        {label}
      </button>
    </form>
  )
}

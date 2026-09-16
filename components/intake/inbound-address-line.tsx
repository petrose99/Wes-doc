"use client"

import { useState } from "react"
import { toast } from "sonner"

/** #264 spec §3.1: the shared "Or email them to ‹address›" line + Copy control, first used on the
 * Invoices first-use state. #266's Add-documents dialog is a second consumer; Admin's
 * `InboundEmailAddress` (components/settings/inbound-email-settings.tsx) keeps its own frame for
 * now — folding it into this shared line is #266's `clarify` pass (spec §3.1, B4). */
export function InboundAddressLine({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { toast.error("Could not copy the address") }
  }
  return <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[13px] text-slate-500 max-md:text-sm max-md:text-slate-700">
    <span>Or email them to <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{address}</code></span>
    <button type="button" onClick={() => void copy()} aria-label="Copy the email address"
      className="inline-flex h-9 items-center px-2 font-medium text-emerald-700 hover:underline max-md:h-12 max-md:rounded-md max-md:border max-md:border-slate-300 max-md:px-4 max-md:text-slate-800 max-md:hover:bg-slate-50">
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  </p>
}

"use client"

import { resetBigcapitalConnectionAction } from "@/app/(app)/workspaces/[workspaceId]/accounting-actions"
import { Button } from "@/components/ui/button"
import { AlertTriangle, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

const MESSAGES: Record<string, { title: string; body: string; showReset: boolean }> = {
  stale_credentials: {
    title: "Your saved accounting credentials are no longer readable",
    body: "The secret key that encrypted this workspace's ledger password has changed since the account was provisioned, so we can't sign you in. Reset the connection to re-provision a fresh account under the current key.",
    showReset: true,
  },
  no_connection: {
    title: "This workspace has no accounting connection yet",
    body: "The ledger hasn't been provisioned for this workspace. Start provisioning below.",
    showReset: false,
  },
  sign_in_failed: {
    title: "Couldn't open the ledger",
    body: "Signing in to the ledger failed. If the problem persists, resetting the connection re-provisions a fresh account.",
    showReset: true,
  },
}

export function AccountingErrorBanner({ workspaceId, error, isOwner }: { workspaceId: string; error: string; isOwner: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const info = MESSAGES[error] ?? { title: "Something went wrong opening the ledger", body: error, showReset: false }

  const clearError = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete("error")
    router.replace(url.pathname + (url.search || ""))
  }

  const reset = () => startTransition(async () => {
    const res = await resetBigcapitalConnectionAction(workspaceId)
    if (res.success) {
      toast.success("Connection reset — provisioning started")
      clearError()
      router.refresh()
    } else {
      toast.error(res.error || "Could not reset connection")
    }
  })

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900">{info.title}</p>
        <p className="mt-1 text-sm text-amber-800">{info.body}</p>
        {info.showReset && isOwner && (
          <div className="mt-3">
            <Button type="button" size="sm" disabled={pending} onClick={reset} className="bg-amber-700 text-white hover:bg-amber-800">
              {pending ? "Resetting…" : "Reset connection"}
            </Button>
          </div>
        )}
      </div>
      <button type="button" onClick={clearError} aria-label="Dismiss" className="shrink-0 rounded-md p-1 text-amber-700 hover:bg-amber-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

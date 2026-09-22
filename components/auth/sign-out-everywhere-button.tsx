"use client"

import { reportAuthEvent } from "@/lib/auth-audit-client"
import { createClient } from "@/lib/supabase/client"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

/** F13: ends every session on the account, not just this one — supabase.auth.signOut({ scope:
 * 'global' }) revokes every refresh token for the user, so a browser signed in elsewhere is
 * logged out on its next request. This browser included: it also clears the local session, same
 * as the sidebar's ordinary sign-out, so the redirect afterward is unconditional. */
export function SignOutEverywhereButton() {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const signOutEverywhere = async () => {
      setBusy(true)
      try {
        reportAuthEvent("auth_logout", { method: "everywhere" })
        const { error } = await createClient().auth.signOut({ scope: "global" })
        if (error) { toast.error("Could not sign out everywhere"); setBusy(false); return }
        window.location.href = "/login"
      } catch {
        toast.error("Couldn't reach the server")
        setBusy(false)
      }
  }
  return <>
    <button
      type="button"
      className="inline-flex min-h-11 items-center rounded-md border border-hairline px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
      disabled={busy}
      onClick={() => setConfirming(true)}
    >
      {busy ? "Signing out…" : "Sign out everywhere"}
    </button>
    <ConfirmDialog
      open={confirming}
      busy={busy}
      title="Sign out of every session?"
      description="Every browser and phone signed in to your account is signed out, this one included. You will need to sign in again."
      confirmLabel={busy ? "Signing out…" : "Sign out everywhere"}
      onConfirm={() => void signOutEverywhere()}
      onCancel={() => setConfirming(false)}
    />
  </>
}

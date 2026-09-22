"use client"

import { reportAuthEvent } from "@/lib/auth-audit-client"
import { createClient } from "@/lib/supabase/client"
import { LogOut } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

/** The everyday sign-out, scoped to this session. Shared by the account menu and the phone's
 * Account page. "Sign out everywhere" (every session on the account) lives on Security. */
export function useSignOut() {
  const [busy, setBusy] = useState(false)
  const signOut = async () => {
    setBusy(true)
    try {
      // Reported before signOut(), not after: the session that attributes this event to an actor
      // is still valid here and gone the moment signOut() resolves.
      reportAuthEvent("auth_logout")
      await createClient().auth.signOut()
      // A full navigation rather than router.push: the session cookie is gone, so every cached
      // server component for this user has to be dropped too.
      window.location.href = "/login"
    } catch {
      toast.error("Couldn't sign out — please try again")
      setBusy(false)
    }
  }
  return { busy, signOut }
}

export function SignOutButton() {
  const { busy, signOut } = useSignOut()
  return <button type="button" disabled={busy} onClick={() => void signOut()}
    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-hairline px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50">
    <LogOut className="h-4 w-4" aria-hidden />{busy ? "Signing out…" : "Sign out"}
  </button>
}

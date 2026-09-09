"use client"

import { AuthDivider } from "@/components/auth/fields"
import { postSignInDestination } from "@/lib/auth-post-sign-in"
import { reportAuthEvent } from "@/lib/auth-audit-client"
import { createNonce, loadGoogleIdentityScript, type GoogleCredentialResponse, type GooglePromptNotification } from "@/lib/google-identity"
import { createClient } from "@/lib/supabase/client"
import { useEffect, useRef, useState } from "react"

/** Rendered only where the server has told the page that Google is configured — see
 * isGoogleAuthEnabled in lib/config.ts, which tracks NEXT_PUBLIC_GOOGLE_CLIENT_ID. That is a
 * UI-only signal: the client ID must also be listed under the Google provider's "Authorized Client
 * IDs" on the Supabase dashboard, which this app cannot read back, so the two are kept in sync by
 * hand. If they drift the button renders and the token exchange fails with a visible error rather
 * than signing anyone in.
 *
 * The button is drawn by us, not by Google — an earlier version handed the whole button to
 * google.accounts.id.renderButton(), which meant the button simply did not exist until the GIS
 * script loaded and Google decided to draw into the slot. On a stalled connection (a big-site
 * "Sign in with Google" button always renders, then fails visibly on click; this one used to just
 * never appear) that reads as the feature being missing rather than broken. This button is real,
 * static markup — it always renders — and only touches Google's script when clicked, so a network
 * or FedCM failure surfaces as a click that produces an error message, not an absent control. */
export function GoogleButton({ redirectTo = "/workspaces", intent = "signin", onError }: {
  redirectTo?: string
  intent?: "signin" | "signup"
  onError?: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  // initialize() needs a fresh nonce per attempt, but the script itself only needs loading once —
  // memoized on a ref so a second click while the first is still settling reuses the same load
  // rather than racing two <script> tags in.
  const loadPromise = useRef<Promise<void> | null>(null)
  const destination = useRef(redirectTo)
  useEffect(() => { destination.current = redirectTo }, [redirectTo])

  const signIn = async (response: GoogleCredentialResponse, rawNonce: string) => {
    if (!response.credential) {
      onError?.("Google did not return a sign-in token. Please try again.")
      return
    }
    onError?.("")
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: response.credential, nonce: rawNonce })
      if (error) throw error

      reportAuthEvent("auth_login_success", { method: "google" })
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      // A hard navigation, not router.push: the session cookie was minted a moment ago, and a
      // client-side push would render the destination against the session-less cached payload —
      // which on /invite/[token] shows "Invitation unavailable" to someone who just signed in.
      window.location.href = postSignInDestination(aal, destination.current)
    } catch {
      reportAuthEvent("auth_login_failed", { method: "google" })
      onError?.("Could not sign you in with Google. Please try again.")
    }
  }

  const onClick = async () => {
    setBusy(true)
    onError?.("")
    try {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
      if (!clientId) throw new Error("google_client_id_missing")

      loadPromise.current ??= loadGoogleIdentityScript()
      const [nonce] = await Promise.all([createNonce(), loadPromise.current])
      const google = window.google
      if (!google) throw new Error("google_identity_unavailable")

      google.accounts.id.initialize({
        client_id: clientId,
        nonce: nonce.hashed,
        callback: (response: GoogleCredentialResponse) => { void signIn(response, nonce.raw) },
        // FedCM: the browser itself mediates the account chooser instead of a Google-hosted iframe
        // riding third-party cookies on accounts.google.com — where those are blocked the iframe
        // lands on accounts.google.com/gsi/transform, renders blank and never returns. FedCM is not
        // universally supported (Firefox has no implementation at all; Chrome for Android's account
        // discovery needs an account known to Chrome itself, not just cookies), but unlike the old
        // renderButton() approach, a FedCM failure here just means prompt()'s moment listener below
        // reports "not displayed" — the button stays visible and reports a real error instead of
        // silently not existing.
        use_fedcm_for_prompt: true,
      })

      let settled = false
      google.accounts.id.prompt((notification: GooglePromptNotification) => {
        settled = true
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          setBusy(false)
          onError?.("Could not open Google sign-in on this browser or connection. Use your email and password instead.")
        } else {
          // A dialog is up (or the user is choosing an account); the credential callback above
          // takes over from here, including turning busy back off once it resolves either way.
          setBusy(false)
        }
      })
      // Older GIS builds have shipped without invoking the moment listener at all on some mobile
      // WebViews; without this the button would spin forever with no explanation.
      setTimeout(() => { if (!settled) { setBusy(false) } }, 5000)
    } catch {
      setBusy(false)
      onError?.("Google sign-in is unavailable right now. Use your email and password instead.")
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        <GoogleLogo />
        {busy ? "Connecting…" : intent === "signup" ? "Sign up with Google" : "Continue with Google"}
      </button>
      {/* The "or" divider lives here rather than in the forms so it cannot outlive the button it
          separates — a lone divider above the email field is a rule with nothing on one side of it. */}
      <AuthDivider />
    </>
  )
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  )
}

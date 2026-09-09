"use client"

import { AuthDivider } from "@/components/auth/fields"
import { postSignInDestination } from "@/lib/auth-post-sign-in"
import { reportAuthEvent } from "@/lib/auth-audit-client"
import { buttonWidthFor, createNonce, loadGoogleIdentityScript, type GoogleCredentialResponse } from "@/lib/google-identity"
import { createClient } from "@/lib/supabase/client"
import { useEffect, useRef, useState } from "react"

/** Rendered only where the server has told the page that Google is configured — see
 * isGoogleAuthEnabled in lib/config.ts, which tracks NEXT_PUBLIC_GOOGLE_CLIENT_ID. That is a
 * UI-only signal: the client ID must also be listed under the Google provider's "Authorized Client
 * IDs" on the Supabase dashboard, which this app cannot read back, so the two are kept in sync by
 * hand. If they drift the button renders and the token exchange fails with a visible error rather
 * than signing anyone in.
 *
 * The visible button is drawn by Google, not by us — GIS only issues credentials to a button it
 * rendered itself, so the styling here is confined to the slot it is placed in. */
export function GoogleButton({ redirectTo = "/workspaces", intent = "signin", onError }: {
  redirectTo?: string
  intent?: "signin" | "signup"
  onError?: (message: string) => void
}) {
  const slot = useRef<HTMLDivElement>(null)
  // "loading" holds the placeholder; "ready" means Google drew its button; "failed" means it never
  // will, and the placeholder has to go — a permanent shimmer reads as a button still on its way.
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading")
  // Read through a ref inside the GIS callback: initialize() is called once on mount, so the
  // callback it closes over would otherwise keep the first render's redirectTo forever — wrong for
  // /login?invite=…, where the destination is resolved from the URL. Written in an effect rather
  // than during render, which React forbids for refs.
  const destination = useRef(redirectTo)
  useEffect(() => { destination.current = redirectTo }, [redirectTo])

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      try {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        if (!clientId) throw new Error("google_client_id_missing")

        const [nonce] = await Promise.all([createNonce(), loadGoogleIdentityScript()])
        if (cancelled || !slot.current) return
        const google = window.google
        if (!google) throw new Error("google_identity_unavailable")

        google.accounts.id.initialize({
          client_id: clientId,
          nonce: nonce.hashed,
          callback: (response: GoogleCredentialResponse) => { void signIn(response, nonce.raw) },
          // FedCM, not the legacy popup. Without these the button opens a Google-hosted popup that
          // hands the credential back through third-party cookies on accounts.google.com; where
          // the browser restricts those the popup lands on accounts.google.com/gsi/transform,
          // renders blank and never returns — the sign-in simply stops, with no error anywhere.
          // FedCM has the browser itself mediate the account chooser, so no popup and no
          // third-party cookie is involved. Chrome is also retiring the non-FedCM path outright.
          use_fedcm_for_prompt: true,
          use_fedcm_for_button: true,
        })
        google.accounts.id.renderButton(slot.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: intent === "signup" ? "signup_with" : "continue_with",
          logo_alignment: "center",
          width: buttonWidthFor(slot.current),
        })
        setStatus("ready")
      } catch {
        if (cancelled) return
        setStatus("failed")
        onError?.("Google sign-in is unavailable right now. Use your email and password instead.")
      }
    }

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

    void start()
    return () => { cancelled = true }
    // onError is a fresh closure on every render of the parent form; re-running this effect for it
    // would tear down and redraw Google's button on each keystroke in the email field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent])

  // Nothing at all once it has failed: the form still has email and password, and the error
  // message says why Google is missing. An empty slot beats a dead control.
  if (status === "failed") return null

  // The "or" divider lives here rather than in the forms so it cannot outlive the button it
  // separates — a lone divider above the email field is a rule with nothing on one side of it.
  return (
    <>
      <div className="min-h-11">
        {/* Google draws into this element. The placeholder keeps the form from jumping as the
            script loads, and disappears rather than lingering behind the rendered button. */}
        <div ref={slot} className="flex justify-center [&>div]:!w-full" />
        {status === "loading" && (
          // Labelled rather than a bare shimmer: on a mobile browser where accounts.google.com is
          // slow to reach, an unlabelled gray rectangle reads as "the button is broken" long before
          // the failure timeout fires. A visible "loading" line tells the visitor to wait a beat.
          <div
            className="flex h-11 w-full animate-pulse items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500"
            role="status"
            aria-live="polite"
          >
            Loading Google sign-in…
          </div>
        )}
      </div>
      <AuthDivider />
    </>
  )
}

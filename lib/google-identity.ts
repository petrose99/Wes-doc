/** Google Identity Services (GIS) — the browser half of "Continue with Google".
 *
 * This replaces the `signInWithOAuth` redirect flow. The difference that matters is where Google
 * sends the user back to: the redirect flow hands control to the Supabase Auth server, so the URI
 * registered in Google Cloud has to be <project>.supabase.co/auth/v1/callback. GIS never leaves
 * this origin — Google returns a signed ID token straight to the page, which we then exchange with
 * Supabase via signInWithIdToken. So Google Cloud is configured with an Authorized JavaScript
 * origin (this app's domain) and no redirect URI at all, and Supabase still mints the session, so
 * MFA, the idle logoff in lib/supabase/middleware.ts and User provisioning are all untouched.
 *
 * app/auth/callback/route.ts stays in service regardless — password-recovery links still arrive
 * through it. */

const GIS_SRC = "https://accounts.google.com/gsi/client"

export type GoogleCredentialResponse = { credential?: string }

type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string
        callback: (response: GoogleCredentialResponse) => void
        nonce: string
        auto_select?: boolean
        cancel_on_tap_outside?: boolean
        use_fedcm_for_prompt?: boolean
      }) => void
      renderButton: (parent: HTMLElement, options: {
        type?: "standard" | "icon"
        theme?: "outline" | "filled_blue" | "filled_black"
        size?: "large" | "medium" | "small"
        text?: "signin_with" | "signup_with" | "continue_with" | "signup"
        shape?: "rectangular" | "pill"
        logo_alignment?: "left" | "center"
        width?: number
      }) => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityApi
  }
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

/** A nonce pair binding one ID token to one sign-in attempt, so a token lifted from another page
 * (or replayed later) will not verify.
 *
 * The split is required by the protocol, not decoration: Google embeds the *hashed* value in the
 * ID token it signs, and Supabase re-hashes the *raw* value we hand it and compares the two. Send
 * the same value to both and verification fails. SHA-256, hex-encoded, is what Supabase's
 * implementation expects — this is not a free choice of digest or encoding. */
export async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))
  return { raw, hashed: toHex(new Uint8Array(digest)) }
}

let scriptPromise: Promise<void> | null = null

/** How long to wait for accounts.google.com before giving up on it.
 *
 * A timeout is needed on top of the error event, not instead of it: a network that blocks or
 * black-holes the host (rather than refusing the connection) leaves the request pending
 * indefinitely and fires no "error" at all — observed on a connection where accounts.google.com
 * hung for 25s+ while www.google.com answered in under a second. Without this the button would
 * show its loading placeholder forever and never tell the user anything went wrong. */
const GIS_LOAD_TIMEOUT_MS = 10_000

/** Loads the GIS script once per page, however many buttons ask for it. Memoized on the promise
 * rather than on a "loaded" boolean so two buttons mounting in the same tick share one request
 * instead of racing two <script> tags in. A rejection clears the memo so a later retry — the user
 * clicking again after a dropped connection — can actually re-attempt the load. */
export function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    const script = existing ?? document.createElement("script")
    const timer = setTimeout(() => reject(new Error("google_identity_script_timeout")), GIS_LOAD_TIMEOUT_MS)
    const settle = (outcome: () => void) => { clearTimeout(timer); outcome() }
    script.addEventListener("load", () => settle(resolve), { once: true })
    script.addEventListener("error", () => settle(() => reject(new Error("google_identity_script_failed"))), { once: true })
    if (!existing) {
      script.src = GIS_SRC
      script.async = true
      document.head.appendChild(script)
    }
  }).catch((error) => {
    scriptPromise = null
    throw error
  })

  return scriptPromise
}

/** GIS renders a fixed-width button — it takes a pixel count and ignores percentages — so the
 * width has to be measured from the slot it is dropped into or it will not line up with the email
 * and password fields beneath it. 400 is Google's own documented maximum; below 200 its label is
 * truncated, so a container narrower than that is better served by a button that overflows
 * slightly than by one reading "Sign in w…". */
export function buttonWidthFor(container: { offsetWidth: number }): number {
  return Math.min(400, Math.max(200, Math.round(container.offsetWidth) || 320))
}

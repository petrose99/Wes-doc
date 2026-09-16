/** Where a freshly authenticated browser should go next.
 *
 * Shared by every client-side path that establishes a session — the password form and the Google
 * button — because the MFA step is not optional for accounts that have a factor enrolled, and a
 * second sign-in route that forgot to check would hand out an aal1 session that hipaaMode
 * workspaces are supposed to refuse. One function means a new sign-in method cannot quietly skip
 * the check. */
export function postSignInDestination(
  assurance: { currentLevel?: string | null; nextLevel?: string | null } | null | undefined,
  redirectTo: string,
): string {
  const needsChallenge = assurance?.nextLevel === "aal2" && assurance.nextLevel !== assurance.currentLevel
  return needsChallenge ? `/mfa/challenge?next=${encodeURIComponent(redirectTo)}` : redirectTo
}

/** Validates a `?next=` return path (#271: the Approval notice's deep link survives sign-in).
 * Accepts only a same-origin relative path: starts with a single `/`, not `//` or `/\` (browsers
 * normalise `\` to `/`, so `/\evil.com` is protocol-relative in disguise), and not `/login`
 * itself (no loop). Anything else returns null and the caller uses its default destination. */
export function safeNextPath(value: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || raw.length > 2048) return null
  if (!/^\/(?![/\\])/.test(raw)) return null
  if (/^\/login(?:[/?#]|$)/.test(raw)) return null
  if (/[\r\n]/.test(raw)) return null
  return raw
}

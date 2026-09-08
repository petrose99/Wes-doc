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

import { getApiUser, getCurrentUser, getSession } from "@/lib/auth"
import { User } from "@/prisma/client"
import { notFound, redirect } from "next/navigation"

/** The platform role, not a workspace role. WorkspaceMember.role ("owner"/"member") is a
 * different axis entirely — a platform admin is usually a plain member of nothing. */
export const isAdmin = (user: Pick<User, "role"> | null | undefined) => user?.role === "admin"

/** Emails that may reach /admin at aal1 for lock-out recovery. Comma-separated env var.
 * Every allow-listed bypass is logged (console.warn, structured tag) so a real audit trail exists
 * even though this path deliberately skips the DB write (an admin locked out of MFA is likely
 * locked out of enough state that we do not want DB dependencies on the recovery path). */
function breakGlassEmails(): string[] {
  const raw = process.env.BREAK_GLASS_ADMIN_EMAIL || ""
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
}

function isBreakGlassEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return breakGlassEmails().includes(email.toLowerCase())
}

/** MFA (aal2) is required for admin console access — NIST CSF PR.AA-03. Break-glass allow-list
 * lets a named recovery account in at aal1, and that entry is logged. */
export function isAalSufficient(aal: string | null | undefined): boolean {
  return aal === "aal2"
}

/** Page/layout guard for /admin.
 *
 * notFound() rather than a bare throw: a throw in a layout escapes that segment's error.tsx and
 * lands on global-error.tsx (the same trap app/(app)/workspaces/[workspaceId]/layout.tsx
 * documents), whereas notFound() and redirect() throw Next's own control-flow signals and are
 * handled properly. A 404 also declines to tell a signed-in customer that /admin exists at all.
 *
 * getCurrentUser re-reads the User row on every request (lib/auth.ts), so a revoked admin loses
 * the console immediately rather than when their 180-day session cookie cache expires.
 *
 * MFA gate: a user with role=admin but aal=aal1 is redirected to the MFA enrolment/challenge page
 * rather than 404'd — telling a real admin their session is not MFA-elevated is not a leak, and
 * the alternative would look like a mysterious disappearance of the console. Break-glass emails
 * (BREAK_GLASS_ADMIN_EMAIL) bypass and log the entry.
 */
export async function requireAdminPage(): Promise<User> {
  const user = await getCurrentUser()
  if (!isAdmin(user)) notFound()
  const session = await getSession()
  if (isAalSufficient(session?.aal)) return user
  if (isBreakGlassEmail(user.email)) {
    console.warn(
      `[break-glass] admin console entered at aal1 by ${user.email} (userId=${user.id}). Configured via BREAK_GLASS_ADMIN_EMAIL. Investigate and disable once MFA is re-enrolled.`,
    )
    return user
  }
  redirect("/mfa/challenge?next=/admin-next")
}

/** The guard for the console's data API — and the one that actually enforces anything.
 *
 * next-admin ships no authorization of its own, and its handler answers every read and write the
 * console performs. The page's requireAdminPage above does not run for those requests, so this is
 * what stands between a signed-in customer who guessed the URL and the whole database. It is
 * installed as the `onRequest` middleware in app/api/admin-next/[[...nextadmin]]/route.ts.
 *
 * Non-throwing on purpose: the caller turns null into the same 404 the pages give, rather than a
 * rejected promise that would surface as a 500 and confirm the route exists. */
export async function requireAdminActor(): Promise<User | null> {
  const user = await getApiUser()
  if (!isAdmin(user)) return null
  const session = await getSession()
  if (isAalSufficient(session?.aal)) return user
  if (isBreakGlassEmail(user!.email)) {
    console.warn(
      `[break-glass] admin api entered at aal1 by ${user!.email} (userId=${user!.id}).`,
    )
    return user
  }
  return null
}

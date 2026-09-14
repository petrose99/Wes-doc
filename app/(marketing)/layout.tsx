import { MarketingFooter } from "@/components/marketing/footer"
import { MarketingNav } from "@/components/marketing/nav"
import { getSession } from "@/lib/auth"
import { getUserBySupabaseUserId } from "@/models/users"
import { getWorkspacesForUser } from "@/models/workspaces"

/** Reads the session directly rather than through getCurrentUser(), which redirects anonymous
 * visitors to the login page — that would make the entire marketing site unreachable to exactly
 * the people it exists for. Workspaces are only listed, never created: browsing the site has no
 * side effects, and /workspaces still mints the first one on demand.
 *
 * getUserBySupabaseUserId, not getUserById: session.user.id is the Supabase identity id, not the
 * local users.id, since the Supabase migration. This intentionally skips resolveOrProvisionUser
 * (unlike getViewerUser) — a first-ever visit before the local row is provisioned just shows the
 * signed-out nav, which is a fine outcome for a marketing page and cheaper than provisioning one
 * on every anonymous pageview.
 *
 * The session lookup is capped at 2.5s and failure-tolerant. The auth service being slow or down
 * must never take the marketing site with it: a visitor with a stale session cookie was getting a
 * 60s hang and then Caddy's 502 whenever Supabase timed out, because getSession() retries 504s.
 * On timeout or error the page simply renders the signed-out nav — the only cost is a "Sign in"
 * button shown to someone who is signed in, and only while auth is degraded. */
const SESSION_LOOKUP_TIMEOUT_MS = 2500

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await Promise.race([
    getSession().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), SESSION_LOOKUP_TIMEOUT_MS)),
  ])
  let workspaceHref: string | undefined
  if (session) {
    try {
      const user = await getUserBySupabaseUserId(session.user.id)
      const workspace = user ? (await getWorkspacesForUser(user.id))[0] : null
      workspaceHref = user ? (workspace ? `/workspaces/${workspace.id}` : "/workspaces") : undefined
    } catch {
      // A stale session or unavailable local database must not replace a public page with the
      // global error screen. The signed-out nav is the safe, honest fallback until the next
      // request can resolve the local account and workspace again.
      workspaceHref = undefined
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <MarketingNav workspaceHref={workspaceHref} />
      <main id="main-content" className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  )
}

export const dynamic = "force-dynamic"

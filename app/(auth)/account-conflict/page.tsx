import { SignOutButton } from "@/components/auth/sign-out-button"
import { AlertTriangle } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

/** Landing page for the "one local account, two Supabase identities" case that
 * models/users.ts::findLinkedUser refuses to auto-link. Reached by a redirect from
 * lib/auth.ts::getViewerUser when that error surfaces — the alternative was letting it escape to
 * global-error.tsx, which reads as an app crash rather than a real thing to resolve. */
export default function AccountConflictPage() {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold text-slate-900">This email is already linked to a different sign-in</h1>
      <p className="text-sm text-slate-600">
        Another sign-in method already owns this account. Sign out and back in with your original
        method, or contact support so we can reconcile the two. Nothing in your workspace has been
        changed.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <SignOutButton />
        <Link
          href="mailto:support@docubite.app?subject=Account%20conflict"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Contact support
        </Link>
      </div>
    </div>
  )
}

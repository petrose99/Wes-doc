import Link from "next/link"
import type { Metadata } from "next"
import { Logo } from "@/components/marketing/logo"
import { Button } from "@/components/ui/button"
import { resolveStopPageState } from "@/lib/notices/stop-state"

/** Public landing for the "Stop these emails" link in #271's Approval notice. No session: the
 * signed token in `t` is the whole authority. GET only ever renders — the write is a plain form
 * POST to /notices/stop/confirm (works without JS; a scanner's GET changes nothing). Four states:
 * confirm · done (after the POST, token re-verified) · already-off · invalid. The card is the
 * auth layout's, so someone arriving from a mail lands somewhere that looks like the sign-in
 * they already know. */

export const metadata: Metadata = { title: "Approval emails — DocuBite", robots: { index: false } }
export const dynamic = "force-dynamic"

type Search = { t?: string; done?: string; error?: string }

export default async function StopNoticesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { t, done, error } = await searchParams
  const state = await resolveStopPageState(t, done === "1")
  const accountHref = (workspaceId: string) => `/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/account`)}`

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" aria-label="DocuBite home" className="mb-8"><Logo markClassName="h-8 w-8" /></Link>
      <main className="w-full max-w-md rounded-[2rem] rounded-tr-md border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        {state.kind === "confirm" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Stop approval emails?</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              You&rsquo;ll stop getting emails when an Approval needs you in {state.workspaceName}. Approvals still wait for you in DocuBite.
            </p>
            {error === "1" && (
              <p role="alert" className="mt-3 text-sm leading-6 text-red-700">Couldn&rsquo;t save this. Try the link again.</p>
            )}
            <form method="POST" action="/notices/stop/confirm" className="mt-6">
              <input type="hidden" name="t" value={t} />
              <Button type="submit" className="min-h-11 w-full">Stop these emails</Button>
            </form>
          </>
        )}
        {state.kind === "done" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">You&rsquo;ll stop getting approval emails.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Approvals still wait for you in DocuBite; nothing is emailed.</p>
            <Link href={accountHref(state.workspaceId)} className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
              Turn them back on
            </Link>
          </>
        )}
        {state.kind === "already-off" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Approval emails are already off.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Approvals still wait for you in DocuBite; nothing is emailed.</p>
            <Link href={accountHref(state.workspaceId)} className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
              Turn them back on
            </Link>
          </>
        )}
        {state.kind === "invalid" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">This link isn&rsquo;t valid.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Open DocuBite and switch Approval emails off under Account.</p>
            <Link href="/login" className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
              Open DocuBite
            </Link>
          </>
        )}
      </main>
      <p className="mt-8 text-center text-xs text-slate-400">
        <Link href="/docs/privacy_policy" className="hover:text-slate-600">Privacy</Link>
        <span className="px-2">·</span>
        <Link href="/docs/terms" className="hover:text-slate-600">Terms</Link>
      </p>
    </div>
  )
}

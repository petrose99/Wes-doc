import { Logo } from "@/components/marketing/logo"
import { isGoogleAuthEnabled } from "@/lib/config"
import Link from "next/link"
import { preload } from "react-dom"

/** A light, centred card on the same slate/emerald palette as the marketing site — the previous
 * near-black full-bleed panel was the one screen in the product that looked like a different app.
 *
 * GoogleButton (login-form.tsx / signup-form.tsx, the only two children of this layout that can
 * render it) does not start fetching accounts.google.com/gsi/client until its own effect runs
 * post-hydration — DNS, TLS and the request itself all queue behind React mounting, which is what
 * reads as the button visibly lagging in after the rest of the page has settled.
 *
 * React 19's preload API (called during render, not module scope — it injects into the response
 * THIS render is producing, so it has to run per request, not once when the module first loads
 * into the server process) fetches the script bytes in parallel with the page's own load, so by
 * the time the effect creates its own <script> tag pointing at the same URL, the browser typically
 * already has it. No separate preconnect() call: fetching a preloaded resource already requires
 * opening the connection, so React silently drops a preconnect to a host it's already preloading
 * from — confirmed against the built output, not assumed. A raw <link rel=preload> JSX tag was
 * tried first and rejected: it rendered ALONGSIDE a second, differently-attribute-ordered one Next
 * hoisted on its own for the same URL — harmless (browsers coalesce identical preloads) but not
 * clean. preload() is the framework-supported way to say the same thing, and it dedupes by
 * construction; there is exactly one tag in the output.
 *
 * preload is checked against script-src, and unlike the effect's own <script> tag it carries no
 * nonce and isn't created by a trusted script at runtime, so strict-dynamic's propagated trust does
 * not reach it — harmless today only because CSP_ENFORCE is unset in production
 * (Content-Security-Policy-Report-Only never blocks, only reports). If that ever flips on, this
 * stops helping rather than breaking anything: the effect's own script tag still loads exactly as
 * it does now.
 *
 * Gated on the same server flag GoogleButton itself gates on — a deployment with no Google client
 * id should not fetch a script it is never going to load. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  if (isGoogleAuthEnabled) preload("https://accounts.google.com/gsi/client", { as: "script" })

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" aria-label="DocuBite home" className="mb-8"><Logo markClassName="h-8 w-8" /></Link>
      <div className="w-full max-w-md rounded-[2rem] rounded-tr-md border border-slate-200 bg-white p-7 shadow-[0_28px_70px_-48px_rgba(41,37,36,.5)] sm:p-9">
        {children}
      </div>
      <p className="mt-8 text-center text-xs text-slate-400">
        <Link href="/docs/privacy_policy" className="hover:text-slate-600">Privacy</Link>
        <span className="px-2">·</span>
        <Link href="/docs/terms" className="hover:text-slate-600">Terms</Link>
      </p>
    </div>
  )
}

export const dynamic = "force-dynamic"

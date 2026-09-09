import { Logo } from "@/components/marketing/logo"
import type { Route } from "next"
import Link from "next/link"

const LINKS: { href: Route; label: string }[] = [
  { href: "/#how", label: "How it works" },
  { href: "/#extraction", label: "Extraction" },
  { href: "/#trace", label: "Provenance" },
  { href: "/#checks", label: "Checks" },
  { href: "/#automation", label: "Automation" },
  { href: "/#library", label: "Library" },
  { href: "/#faq", label: "FAQ" },
]

/** The marketing header. Signed-in visitors get one CTA back into their workspace instead of the
 * trial pitch — everything else (links, logo) stays the same regardless of session. */
export function MarketingNav({ workspaceHref }: { workspaceHref?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-cream-200 bg-cream-50/85 backdrop-blur">
      <div className="mx-auto flex flex-wrap items-center justify-between gap-4 px-5 py-3.5" style={{ maxWidth: "1180px" }}>
        <Link href="/" aria-label="DocuBite home" className="inline-flex items-center">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-[0.86rem] font-medium sm:gap-5.5">
          <div className="hidden items-center gap-5.5 md:flex">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-stone-600 transition-colors hover:text-stone-900">
                {link.label}
              </Link>
            ))}
          </div>
          {workspaceHref ? (
            <Link href={workspaceHref as Route} className="inline-flex h-9 items-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800">
              Open workspace
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-stone-600 transition-colors hover:text-stone-900">
                Sign in
              </Link>
              <Link href="/signup" className="inline-flex h-9 items-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800">
                Start free trial
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

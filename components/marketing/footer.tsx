import { Logo } from "@/components/marketing/logo"
import config from "@/lib/config"
import type { Route } from "next"
import Link from "next/link"

const legalLinks: { href: Route; label: string }[] = [
  { href: "/docs/privacy_policy", label: "Privacy" },
  { href: "/docs/terms", label: "Terms" },
  { href: "/docs/cookie", label: "Cookies" },
  { href: "/docs/ai", label: "How we use AI" },
]

export function MarketingFooter() {
  return (
    <footer className="bg-cream-100">
      <div className="perforation mx-auto text-cream-200" style={{ maxWidth: "1180px" }} aria-hidden />
      <div className="mx-auto flex flex-wrap items-center justify-between gap-4.5 px-5 py-7.5" style={{ maxWidth: "1180px" }}>
        <Logo />
        <nav className="flex flex-wrap items-center gap-5 text-[0.83rem] font-medium text-stone-600">
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-stone-900">{link.label}</Link>
          ))}
          <a href={`mailto:${config.app.supportEmail}`} className="transition-colors hover:text-stone-900">{config.app.supportEmail}</a>
        </nav>
      </div>
    </footer>
  )
}

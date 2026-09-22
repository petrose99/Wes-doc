import { ArrowRight, ArrowUpRight } from "lucide-react"
import Link from "next/link"

const CAPABILITIES = [
  {
    href: "/product/extraction",
    title: "Document extraction",
    description: "Supported documents into reviewable rows.",
  },
  {
    href: "/product/controls",
    title: "Controls & fraud",
    description: "Explainable checks before risky steps.",
  },
  {
    href: "/product/close",
    title: "Close the books",
    description: "Gated periods and unposted accrual drafts.",
  },
  {
    href: "/product/data-health",
    title: "Data health",
    description: "Find pipeline, ledger and tax drift.",
  },
  {
    href: "/product/integrations",
    title: "Integrations & API",
    description: "Send reviewed data through connected systems.",
  },
] as const

export function CapabilityBridge() {
  return (
    <section id="product-capabilities" className="border-y border-slate-200 bg-slate-50 py-14 md:py-20" aria-labelledby="product-capabilities-title">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[.78fr_1.22fr] lg:gap-16">
        <div>
          <h2 id="product-capabilities-title" className="max-w-[24rem] text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-.03em] text-slate-950">
            See the work behind the workflow
          </h2>
          <p className="mt-4 max-w-[29rem] text-pretty text-[1.02rem] leading-[1.62] text-slate-600">
            Documents are the entry point. Explore the controls, close work, data checks and system handoffs that carry reviewed work forward.
          </p>
          <Link href="/product" className="group mt-6 inline-flex items-center font-semibold text-emerald-800 underline decoration-emerald-200 underline-offset-4 hover:decoration-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
            Explore the Product <ArrowRight aria-hidden className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <nav aria-label="Product capabilities">
          <ul className="divide-y divide-slate-300 border-y border-slate-300">
            {CAPABILITIES.map(({ href, title, description }) => (
              <li key={href}>
                <Link href={href} className="group grid min-h-16 gap-2 py-4 sm:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)_auto] sm:items-center sm:gap-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-700">
                  <span className="font-display text-base font-bold tracking-[-.015em] text-slate-950 group-hover:text-emerald-800">{title}</span>
                  <span className="text-sm leading-6 text-slate-600">{description}</span>
                  <ArrowUpRight aria-hidden className="h-4 w-4 text-emerald-700 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  )
}

import { ArrowRight } from "lucide-react"
import { solutionsByGroup } from "@/lib/solutions"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Solutions",
  description: "See how DocuBite fits the AP workflow for controllers, bookkeepers and finance-ops teams.",
}

const roleSolutions = solutionsByGroup("ap")

export default function SolutionsPage() {
  return <>
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-5 pt-16 pb-2 lg:pt-20">
        <h1 className="max-w-3xl font-display text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-slate-950 sm:text-6xl">
          Point DocuBite at whatever <span className="text-emerald-600">your team keys in by hand.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600">
          Pick the document your team works with — then see the fields that come out. The parser is general and the templates are yours.
        </p>
      </div>
    </section>

    <section id="by-role" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-20">
        <div>
          <h2 className="max-w-md text-balance font-display text-4xl font-bold leading-[1.05] tracking-[-.035em] text-slate-950 sm:text-5xl">
            Find the workflow that looks like yours.
          </h2>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-600">
            Solutions are organised by the person responsible for moving accounts payable forward. The Product pages explain the mechanisms behind each workflow.
          </p>
        </div>

        <nav aria-label="Solutions by role" className="divide-y divide-slate-200 border-y border-slate-200">
          {roleSolutions.map((solution) => {
            const Icon = solution.icon
            return (
              <Link
                key={solution.slug}
                href={`/solutions/${solution.slug}`}
                className="group flex items-start gap-5 py-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl rounded-tr-sm bg-emerald-50 text-emerald-700">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-xl font-bold tracking-[-.02em] text-slate-950 group-hover:text-emerald-800">{solution.name}</span>
                  <span className="mt-1 block text-base leading-7 text-slate-600">{solution.tagline}</span>
                </span>
                <ArrowRight aria-hidden className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-emerald-700" />
              </Link>
            )
          })}
        </nav>
      </div>
    </section>

    <section id="cta" className="bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="relative overflow-hidden rounded-[2.5rem] rounded-tr-lg bg-emerald-950 px-6 py-14 text-center text-white sm:px-14">
          <h2 className="relative mx-auto max-w-xl font-display text-3xl font-bold tracking-[-0.035em] sm:text-[2.4rem] sm:leading-[1.08]">
            Put a real document through it first.
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg leading-7 text-emerald-100/75">
            Create an account to explore the workflow, or request a demo with a real document.
          </p>
          <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="group inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-white px-7 text-[15px] font-semibold text-emerald-950 shadow-sm transition-colors hover:bg-slate-50">
              Create an account<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/demo" className="group inline-flex h-12 items-center justify-center gap-1.5 rounded-full border border-emerald-700 px-7 text-[15px] font-semibold text-white transition-colors hover:bg-emerald-900">
              Request a demo<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  </>
}

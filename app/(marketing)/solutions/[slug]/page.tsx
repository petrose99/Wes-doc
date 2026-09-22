import { CtaBand } from "@/components/marketing/sections/cta-band"
import { Workflow } from "@/components/marketing/sections/workflow"
import { getSolution, SOLUTIONS } from "@/lib/solutions"
import { ArrowRight } from "lucide-react"
import type { Metadata, Route } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

export function generateStaticParams() {
  return SOLUTIONS.map((solution) => ({ slug: solution.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const solution = getSolution((await params).slug)
  if (!solution) return { title: "Not found" }
  return { title: solution.title, description: solution.description }
}

/** One template for all three role solutions; the copy lives in lib/solutions.ts so the mega-menu, the
 * footer and this page can never disagree about which solutions exist. */
export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const solution = getSolution((await params).slug)
  if (!solution) notFound()

  const siblings = SOLUTIONS.filter((other) => other.slug !== solution.slug)

  return <>
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
        <h1 className="max-w-3xl font-display text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-slate-950 sm:text-6xl">{solution.title}</h1>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
          <solution.icon className="h-4 w-4" />{solution.name}
        </p>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">{solution.description}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/signup"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-700 px-7 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800"
          >
            Create an account<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/demo"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-7 text-base font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50"
          >
            Request a demo<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-12 rounded-[2rem] rounded-tr-md border border-slate-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-700">Workflow signals</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {solution.fields.map((field) => (
              <li key={field} className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700">{field}</li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-slate-600">The same workspace keeps intake, review, controls and the accounting handoff visible to the people responsible for the AP loop.</p>
        </div>
      </div>
    </section>

    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="max-w-2xl font-display text-4xl font-bold tracking-[-0.035em] text-slate-950 sm:text-5xl">What this workflow keeps in view</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {solution.points.map((point, index) => {
            const tints = ["bg-white", "bg-emerald-50", "bg-amber-50"]
            return (
              <article key={point.title} className={`rounded-[2rem] rounded-tr-md border border-slate-200 p-6 ${tints[index % tints.length]}`}>
                <span className="font-display text-sm font-bold text-slate-600">0{index + 1}</span>
                <h3 className="mt-4 font-display text-xl font-bold tracking-[-0.02em]">{point.title}</h3>
                <p className="mt-2 leading-7 text-slate-600">{point.text}</p>
              </article>
            )
          })}
        </div>
      </div>
    </section>

    <Workflow />

    <section className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-600">Other solutions</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {siblings.map((other) => (
            <Link key={other.slug} href={`/solutions/${other.slug}` as Route} className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-800">
              <other.icon className="h-4 w-4 text-emerald-700" />{other.name}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>
    </section>

    <CtaBand />
  </>
}

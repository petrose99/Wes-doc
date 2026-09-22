import { getResourcePosts, RESOURCE_CATEGORIES, type ResourceCategory } from "@/lib/resources"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

export const dynamic = "force-static"
export const dynamicParams = false
export const revalidate = false

export const metadata: Metadata = {
  title: "Resources",
  description: "Practical notes on document controls, invoice workflows, and the work behind every bill.",
}

const CATEGORY_DETAILS: Record<ResourceCategory, { label: string; description: string }> = {
  guides: { label: "Guides", description: "Practical explanations for the work finance teams do every week." },
  "product-deep-dives": { label: "Product deep-dives", description: "The mechanisms behind DocuBite, with the limits included." },
  comparisons: { label: "Comparisons", description: "Plain-language comparisons for choosing a workflow." },
  "business-case": { label: "Business case", description: "The questions that help a team decide what to change." },
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
}

export default function ResourcesPage() {
  const posts = getResourcePosts()
  const featured = posts[0]

  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:py-24 lg:grid-cols-[1.05fr_.95fr] lg:items-end">
          <div>
            <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.04] tracking-[-0.04em] text-slate-950 sm:text-5xl">
              Resources for the work behind every bill.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Clear notes on invoice workflows, document controls, and the checks that make accounting work easier to trust.
            </p>
          </div>

          {featured ? (
            <Link href={`/resources/${featured.slug}`} className="group border-t-2 border-slate-900 pt-5">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Start here</p>
              <h2 className="mt-3 font-display text-2xl font-bold leading-tight tracking-[-0.025em] text-slate-950 group-hover:text-emerald-800 sm:text-3xl">
                {featured.title}
              </h2>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                Read the guide <ArrowUpRight aria-hidden className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </Link>
          ) : (
            <p className="border-t-2 border-slate-900 pt-5 text-slate-600">The first guide is on its way.</p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24" aria-labelledby="resource-categories">
        <h2 id="resource-categories" className="sr-only">Browse resources by category</h2>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {RESOURCE_CATEGORIES.map((category) => {
            const details = CATEGORY_DETAILS[category]
            const categoryPosts = posts.filter((post) => post.category === category)
            return (
              <section key={category} id={category} className="grid gap-7 py-10 md:grid-cols-[minmax(12rem,.6fr)_1.4fr] md:gap-12">
                <div>
                  <h3 className="font-display text-2xl font-bold tracking-[-0.025em] text-slate-950">{details.label}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">{details.description}</p>
                </div>
                {categoryPosts.length > 0 ? (
                  <ul className="divide-y divide-slate-200">
                    {categoryPosts.map((post) => (
                      <li key={post.slug}>
                        <Link href={`/resources/${post.slug}`} className="group block py-5 first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <h4 className="max-w-2xl font-display text-xl font-bold leading-snug tracking-[-0.02em] text-slate-950 group-hover:text-emerald-800">{post.title}</h4>
                            <time dateTime={post.publishedAt} className="shrink-0 text-sm text-slate-500">{formatDate(post.publishedAt)}</time>
                          </div>
                          <p className="mt-2 max-w-2xl text-[0.98rem] leading-7 text-slate-600">{post.description}</p>
                          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800">Read more <ArrowRight aria-hidden className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="self-start border-t border-slate-200 pt-5 text-sm leading-6 text-slate-500 md:border-t-0 md:pt-0">No posts in this category yet. It stays here so the library can grow without changing its shape.</p>
                )}
              </section>
            )
          })}
        </div>
      </section>
    </>
  )
}

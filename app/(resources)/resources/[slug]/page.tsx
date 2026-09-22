import { ResourceFeatureImage } from "@/components/marketing/resources/feature-image"
import { ResourceContent } from "@/components/marketing/resources/resource-content"
import { getResourcePost, getResourcePosts, type ResourceCategory } from "@/lib/resources"
import { ArrowRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

export const dynamic = "force-static"
export const dynamicParams = false
export const revalidate = false

const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  guides: "Guides",
  "product-deep-dives": "Product deep-dives",
  comparisons: "Comparisons",
  "business-case": "Business case",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
}

export function generateStaticParams() {
  return getResourcePosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = getResourcePost((await params).slug)
  if (!post) return { title: "Resource not found" }
  return {
    title: post.title,
    description: post.description,
    openGraph: { type: "article", title: post.title, description: post.description, images: [post.featureImage] },
    twitter: { card: "summary_large_image", title: post.title, description: post.description, images: [post.featureImage] },
  }
}

export default async function ResourcePostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = getResourcePost((await params).slug)
  if (!post) notFound()

  const related = getResourcePosts().filter((candidate) => candidate.slug !== post.slug && candidate.category === post.category).slice(0, 2)

  return (
    <>
      <article>
        <header className="mx-auto max-w-4xl px-5 pb-10 pt-16 md:pb-12 md:pt-24">
          <Link href={`/resources#${post.category}`} className="text-sm font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4 hover:decoration-emerald-700">{CATEGORY_LABELS[post.category]}</Link>
          <h1 className="mt-5 max-w-4xl font-display text-4xl font-bold leading-[1.04] tracking-[-0.04em] text-slate-950 sm:text-5xl">{post.title}</h1>
          <p className="mt-6 max-w-3xl text-xl leading-8 text-slate-600">{post.description}</p>
          <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">DocuBite Team</span>
            <span aria-hidden>·</span>
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          </div>
          <ResourceFeatureImage src={post.featureImage} alt={post.title} />
        </header>

        <div className="mx-auto max-w-[65ch] px-5 pb-16 md:pb-24">
          <ResourceContent markdown={post.body} />

          <aside className="mt-12 border-y border-slate-200 py-7">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Go deeper</p>
            <p className="mt-3 text-base leading-7 text-slate-600">See how this fits into the product workflow.</p>
            <Link href={post.featureHref} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-slate-950 underline decoration-emerald-400 underline-offset-4 hover:text-emerald-800">
              {post.featureLabel}<ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </aside>
        </div>
      </article>

      <section className="border-t border-slate-200 bg-slate-50" aria-labelledby="related-resources">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <h2 id="related-resources" className="font-display text-3xl font-bold tracking-[-0.03em] text-slate-950">Keep reading</h2>
          <div className="mt-7 grid gap-5 md:grid-cols-2">
            {related.length > 0 ? related.map((candidate) => (
              <Link key={candidate.slug} href={`/resources/${candidate.slug}`} className="group border-t-2 border-slate-900 bg-white p-5 transition-colors hover:bg-emerald-50 sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">{CATEGORY_LABELS[candidate.category]}</p>
                <h3 className="mt-3 font-display text-2xl font-bold leading-tight tracking-[-0.025em] text-slate-950 group-hover:text-emerald-800">{candidate.title}</h3>
                <p className="mt-3 text-[0.98rem] leading-7 text-slate-600">{candidate.description}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800">Read more <ArrowRight aria-hidden className="h-3.5 w-3.5" /></span>
              </Link>
            )) : (
              <Link href="/resources" className="group border-t-2 border-slate-900 bg-white p-5 transition-colors hover:bg-emerald-50 sm:p-7">
                <h3 className="font-display text-2xl font-bold text-slate-950 group-hover:text-emerald-800">Browse all resources</h3>
                <p className="mt-3 text-[0.98rem] leading-7 text-slate-600">Return to the library and choose another topic.</p>
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="bg-emerald-950 px-5 py-16 text-white md:py-20">
        <div className="mx-auto flex max-w-6xl flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="max-w-xl font-display text-3xl font-bold leading-tight tracking-[-0.03em] sm:text-4xl">See your own workflow with a real document.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-emerald-100/75">Create an account to explore the workspace and decide whether DocuBite fits your process.</p>
          </div>
          <Link href="/signup" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-7 text-[15px] font-bold text-emerald-950 shadow-sm transition-colors hover:bg-emerald-50">Create an account <ArrowRight aria-hidden className="h-4 w-4" /></Link>
        </div>
      </section>
    </>
  )
}

import { ArrowRight } from "lucide-react"
import Link from "next/link"

/** Shared closing CTA — account creation leads, with a demo request as the Enterprise path. */
export function CtaBand() {
  return (
    <section id="get-started" className="bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="rounded-[2.5rem] rounded-tr-lg bg-emerald-950 px-6 py-14 text-center text-white sm:px-14">
          <h2 className="mx-auto max-w-2xl font-display text-4xl font-bold leading-[1.05] tracking-[-0.035em] sm:text-5xl">
            Your inbox is full of documents. Let something else <span className="text-amber-300">read them.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-7 text-emerald-100/75">
            Put a real folder through it first.
          </p>

          <div className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-base font-semibold text-emerald-950 shadow-sm transition-colors hover:bg-slate-50"
            >
              Create an account<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/demo"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-emerald-700 px-7 text-base font-semibold text-white transition-colors hover:bg-emerald-900"
            >
              Request a demo<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="perforation mx-auto mt-10 max-w-md text-emerald-800" aria-hidden />

        </div>
      </div>
    </section>
  )
}

import { DemoForm } from "@/components/marketing/demo-form"
import { Toaster } from "@/components/ui/sonner"
import { FileSearch, MailCheck, MessagesSquare, Sparkles } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Request a demo",
  description: "See DocuBite read your own documents. Tell us what you work with, bring the file that gives you the most trouble, and we will run it on a call.",
}

/* This page promises a *request*, not a booking. There is no scheduler behind it — `submitDemoRequest`
   emails the support inbox and a person replies to find a time — so nothing here may show a calendar,
   a slot, or a duration. See https://github.com/petrose99/docubite/issues/144. */
const points = [
  { icon: Sparkles, title: "We run your documents, not ours", text: "Bring it to the call: an invoice, receipt, scan or photo you want to understand. Nothing to upload here — we put it through while you watch." },
  { icon: FileSearch, title: "We answer with your document, not a deck", text: "You see ingestion, extraction and the review sheet end to end on a file of yours, and decide from that whether it fits your workflow." },
  { icon: MessagesSquare, title: "Straight answers on security", text: "Where documents are stored, what reaches a model, what is logged. Bring your IT questions along." },
]

export default function DemoPage() {
  return (
    <section className="bg-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1fr_.9fr] lg:py-20">
        <div>
          <h1 className="max-w-xl font-display text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-slate-950 sm:text-6xl">
            Bring a real document. <span className="text-emerald-600">We will read it live.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">
            Tell us what you work with and we will write back to set up a call — bring a real document, or just tell us what you dictate.
          </p>

          <div className="mt-10 space-y-7">
            {points.map((point) => (
              <div key={point.title} className="flex gap-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl rounded-tr-sm bg-emerald-50 text-emerald-700"><point.icon className="h-5 w-5" /></span>
                <div>
                  <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-slate-900">{point.title}</h2>
                  <p className="mt-1 max-w-md leading-7 text-slate-600">{point.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <DemoForm />
          <div className="docubite-float pointer-events-none absolute z-10 -left-5 -top-8 hidden items-center gap-1.5 rounded-xl rounded-tr-sm bg-emerald-950 px-3 py-1.5 text-xs font-semibold text-emerald-100 shadow-[0_16px_36px_-20px_rgba(2,44,34,.8)] sm:flex">
            <MailCheck className="h-3.5 w-3.5 text-emerald-400" />Replies in one business day
          </div>
          {/* The marketing layout has no Toaster of its own — this is the only page under it that
              raises one, so it mounts here rather than in the shared layout. */}
          <Toaster richColors position="bottom-right" />
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  {
    n: "01",
    title: "Send it in, however it arrives",
    body: "Upload a file or a client's whole shoebox, or email it in and let the bills arrive on their own.",
  },
  {
    n: "02",
    title: "Read the flags first",
    body: "Duplicates, missing periods and fields that couldn't be found are sorted for you. You start from what's wrong, not what's there.",
  },
  {
    n: "03",
    title: "Approve and send it on",
    body: "Export clean CSV for your existing workflow, or push a reviewed bill straight to QuickBooks or Xero — and hand the routine ones over entirely once it has learned how you code them.",
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="bg-cream-50 py-14 md:py-22">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.1] tracking-[-0.03em] text-stone-900">
          Three steps, and none of them is data entry
        </h2>
        <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
          {STEPS.map((step) => (
            <div key={step.n} className="rounded-2xl border border-cream-200 bg-white p-6 shadow-panel">
              <span className="font-display text-[0.9rem] font-bold text-emerald-700">{step.n}</span>
              <h3 className="mt-2 font-display text-xl font-bold tracking-[-0.02em] text-stone-900">{step.title}</h3>
              <p className="mt-2.5 text-pretty text-[0.94rem] leading-[1.58] text-stone-600">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

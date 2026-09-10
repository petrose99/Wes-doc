/** The three acts of the AP loop. Sits BEFORE the detailed 7-step rail so a reader gets the shape
 * in three glances first, then can drop into the deeper rail. The 7 loop steps below each act name
 * are the mapping so the two sections aren't competing enumerations — this is the summary, ApLoop is
 * the deep-dive. */
const ACTS: { n: string; title: string; steps: string; body: string }[] = [
  {
    n: "01",
    title: "In",
    steps: "Capture · Code · Check",
    body: "Bills arrive by email, upload or API. Every field is read, every duplicate paired, and fraud checks catch what other tools miss — before anyone looks at anything.",
  },
  {
    n: "02",
    title: "Through",
    steps: "Match · Approve",
    body: "Each bill is tied to its PO and routed to the right approver by amount. Discrepancies surface with the numbers side by side. Your controls, not ours.",
  },
  {
    n: "03",
    title: "Out",
    steps: "Sync · Pay-ready",
    body: "Approved bills sync to your accounting tool. One click assembles the bank-ready payment file with per-supplier remittance advice — you upload it to your own bank.",
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="bg-cream-50 py-14 md:py-22">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.1] tracking-[-0.03em] text-stone-900">
          The whole loop, in three acts
        </h2>
        <p className="mt-3 max-w-[46rem] text-[1.02rem] leading-[1.6] text-stone-600">
          Seven steps run the loop — your part is these three. Each act is broken down step-by-step just below.
        </p>
        <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
          {ACTS.map((act) => (
            <div key={act.n} className="rounded-2xl border border-cream-200 bg-white p-6 shadow-panel">
              <span className="font-display text-[0.9rem] font-bold text-emerald-700">{act.n}</span>
              <h3 className="mt-2 font-display text-xl font-bold tracking-[-0.02em] text-stone-900">{act.title}</h3>
              <div className="mt-1 text-[0.78rem] font-semibold uppercase tracking-wide text-emerald-700">{act.steps}</div>
              <p className="mt-2.5 text-pretty text-[0.94rem] leading-[1.58] text-stone-600">{act.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

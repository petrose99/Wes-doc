/** The automation story: the product stops asking you the questions it already knows the answer to.
 *
 * The ladder is the same three rungs the workspace actually exposes at Automation → Settings
 * (suggest / auto / touchless), drawn the same way — a filled rung showing how far you have handed
 * over — so the page is describing the control rather than inventing a metaphor for it. Static: it
 * reacts to nothing, so it ships no JavaScript. */

const RUNGS = [
  { name: "Suggest", body: "Coding is proposed. Every document still waits for you." },
  { name: "Auto with approval", body: "Coding is applied. You confirm it with one click." },
  { name: "Touchless", body: "Confident documents publish themselves. The rest still come to you." },
]

const LEARNS = [
  {
    title: "It remembers how you code each supplier",
    body: "Three consistent codings for the same vendor and it applies them itself, without asking the AI at all. Anything less certain still goes through the model, with your history handed to it as a hint.",
  },
  {
    title: "New suppliers have to earn it",
    body: "A supplier’s first documents always reach a person, whatever the confidence score. The bar it has to clear only drops once a run of them comes back clean.",
  },
  {
    title: "It ties the paperwork together",
    body: "Purchase order to invoice to receipt, and bank lines to the invoices they paid — matched for you, so accepting one closes the loop in the ledger too.",
  },
]

const GUARDS = [
  "A confidence floor nothing publishes below",
  "Lower bars for small amounts, higher for large",
  "Your spending policy, written in plain English",
  "A sample of the automatic work routed to review anyway",
]

export function Automation() {
  return (
    <section id="automation" className="bg-cream-50 py-14 md:py-22">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-[46rem]">
          <span className="text-[0.74rem] font-bold uppercase tracking-[.08em] text-emerald-700">Automation</span>
          <h2 className="mt-3 text-balance font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-stone-950">
            Hand over as much as you trust it with, and no more
          </h2>
          <p className="mt-4 text-pretty text-[1.02rem] leading-[1.62] text-stone-600">
            Nothing here switches itself on. You choose how far the pipeline is allowed to go without you,
            and you can see exactly how much of last month actually went through untouched before you move
            the setting again.
          </p>
        </div>

        <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-px overflow-hidden rounded-2xl border border-cream-200 bg-cream-200 shadow-panel">
          {RUNGS.map((rung, i) => (
            <div key={rung.name} className="bg-white p-5">
              <span className={`mb-3.5 block h-1 rounded-full ${i === 0 ? "bg-emerald-600" : "bg-stone-200"}`} aria-hidden />
              <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-stone-900">{rung.name}</h3>
              <p className="mt-1.5 text-pretty text-[0.9rem] leading-[1.55] text-stone-600">{rung.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.84rem] text-stone-500">
          Every workspace starts on the first rung.
        </p>

        <div className="mt-11 flex flex-wrap gap-8 md:gap-13">
          <div className="min-w-0 flex-1 basis-[420px]">
            <dl className="divide-y divide-cream-200 border-t border-cream-200">
              {LEARNS.map((item) => (
                <div key={item.title} className="py-4">
                  <dt className="font-display text-[1.02rem] font-bold tracking-[-0.01em] text-stone-900">{item.title}</dt>
                  <dd className="mt-1.5 text-pretty text-[0.94rem] leading-[1.58] text-stone-600">{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="min-w-0 flex-1 basis-[300px]">
            <div className="rounded-2xl border border-cream-200 bg-white p-6 shadow-panel">
              <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-stone-900">What still stops it</h3>
              <p className="mt-1.5 text-[0.88rem] leading-[1.55] text-stone-600">
                Four limits apply before anything publishes on its own.
              </p>
              <ul className="mt-4 divide-y divide-cream-200 border-t border-cream-200">
                {GUARDS.map((guard) => (
                  <li key={guard} className="py-2.5 text-[0.9rem] leading-[1.5] text-stone-700">{guard}</li>
                ))}
              </ul>
              <p className="mt-4 border-t border-cream-200 pt-3.5 text-[0.86rem] leading-[1.55] text-stone-600">
                A document that trips any of them goes to a person, with the reason attached.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

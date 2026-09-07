const QUESTIONS = [
  {
    q: "What can it actually read?",
    a: "Invoices, receipts, bank statements, and any custom PDF or image you define a template for. Handwritten notes and low-quality scans are expected input. Files up to 50 MB, multi-page documents included — and where one PDF holds several documents, it gets split.",
  },
  {
    q: "Where do my files live?",
    a: "In private, encrypted storage with keys managed for you. Browsers never connect to storage directly — every view is authorised and streamed through the application. Sources and reviewed data are retained for the life of the workspace, and deleting the workspace deletes them.",
  },
  {
    q: "Can my team review together?",
    a: "Yes. Each workspace has owner and member roles with email invitations, a shared review queue badged with what's outstanding, and approval workflows for the documents that need a second signature. Every change is recorded against the person who made it.",
  },
  {
    q: "Can I get my data out?",
    a: "Reviewed data streams out as CSV whenever you want it, columns and all. Reviewed invoices and receipts can also be pushed to QuickBooks or Xero as bills. Nothing here is a one-way door.",
  },
]

export function Faq() {
  return (
    <section id="faq" className="bg-cream-50 py-14 md:py-22">
      <div className="mx-auto max-w-[820px] px-5">
        <h2 className="mb-7 font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.1] tracking-[-0.03em] text-stone-900">
          The questions we get asked
        </h2>
        <div className="flex flex-col gap-2.5">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="rounded-xl border border-cream-200 bg-white p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-stone-900 [&::-webkit-details-marker]:hidden">
                {item.q}<span className="font-bold text-emerald-700">+</span>
              </summary>
              <p className="mt-3 text-pretty text-[0.94rem] leading-[1.6] text-stone-600">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

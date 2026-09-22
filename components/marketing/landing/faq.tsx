const QUESTIONS = [
  {
    q: "What can it actually read?",
    a: "Invoices, receipts, bank statements, and any custom PDF or image you define a template for. PDFs and JPEG, PNG, WebP and HEIC images are supported. Fields that need a closer look are flagged for review. Files up to 50 MB, with multi-page documents included. When one PDF holds several documents, it gets split.",
  },
  {
    q: "Where do my files live?",
    a: "In private, encrypted storage with keys managed for you. Browsers never connect to storage directly. Every view is authorised and streamed through the application. Sources and reviewed data are retained for the life of the workspace, and deleting the workspace deletes them.",
  },
  {
    q: "Does DocuBite move money or pay bills?",
    a: "No, that's deliberate. DocuBite gets your bills ready to pay: coded, checked, matched, approved, synced to your ledger, and assembled into a bank-payment file with a supplier remittance when you're ready. You take that file to your own bank's bulk-payment portal and press send. Payment execution stays outside DocuBite.",
  },
  {
    q: "Can I get my data out?",
    a: "Reviewed data streams out as CSV whenever you want it, columns and all. Reviewed invoices and receipts push to your accounting tool, including QuickBooks and Xero, as bills. And when you're ready to pay, DocuBite assembles a bank-ready payment file with per-supplier remittance advice that you upload to your own bank. Nothing here is a one-way door.",
  },
]

export function Faq() {
  return (
    <section id="faq" className="bg-white py-14 md:py-22">
      <div className="mx-auto max-w-[820px] px-5">
        <h2 className="mb-7 font-display text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-[1.1] tracking-[-0.03em] text-slate-900">
          The questions we get asked
        </h2>
        <div className="flex flex-col gap-2.5">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group rounded-xl border border-slate-200 bg-white p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center text-lg font-bold leading-none text-emerald-700">
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <p className="mt-3 max-w-[33rem] text-pretty text-[0.94rem] leading-[1.6] text-slate-600">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

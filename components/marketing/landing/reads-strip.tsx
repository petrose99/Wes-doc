const READS = ["Invoices", "Receipts", "Bank statements", "Handwritten notes", "Any custom PDF or image"]

export function ReadsStrip() {
  return (
    <div className="bg-cream-100">
      <div className="perforation mx-auto max-w-6xl text-cream-200" aria-hidden />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5.5 gap-y-2.5 px-5 py-4 text-[0.84rem] font-semibold text-stone-600">
        <span className="text-[0.7rem] font-bold uppercase tracking-[.07em] text-emerald-700">Reads</span>
        {READS.map((item) => <span key={item}>{item}</span>)}
      </div>
    </div>
  )
}

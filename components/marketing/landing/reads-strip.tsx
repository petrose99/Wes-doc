const READS = ["Invoices", "Receipts", "Bank statements", "Scans", "Images (JPEG, PNG, WebP, HEIC)", "Any custom PDF or image"]

export function ReadsStrip() {
  return (
    <div className="bg-slate-50">
      <div className="perforation mx-auto max-w-6xl text-slate-200" aria-hidden />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5.5 gap-y-2.5 px-5 py-4 text-[0.84rem] font-semibold text-slate-600">
        <span className="text-[0.7rem] font-bold uppercase tracking-[.07em] text-emerald-700">Reads</span>
        {READS.map((item) => <span key={item}>{item}</span>)}
      </div>
    </div>
  )
}

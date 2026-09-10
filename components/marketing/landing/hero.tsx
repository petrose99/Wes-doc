import { BiteMark } from "@/components/marketing/logo"
import { BarChart3, Landmark, Library, ListChecks, Table2, Zap } from "lucide-react"
import Link from "next/link"

const rows: { doc: string; supplier: string; total: string; status: "approved" | "review" | "dupe" }[] = [
  { doc: "INV-4471.pdf", supplier: "Northwind Trading", total: "£2,475.60", status: "approved" },
  { doc: "scan_0043.jpg", supplier: "Bell & Sons Hardware", total: "£86.40", status: "approved" },
  { doc: "receipt-cafe.heic", supplier: "Provisions Co.", total: "£19.20", status: "review" },
  { doc: "INV-4471 (1).pdf", supplier: "Northwind Trading", total: "£2,475.60", status: "dupe" },
  { doc: "statement-feb.pdf", supplier: "Metro Bank", total: "—", status: "approved" },
]

/** The rail the app actually renders (components/shell/sidebar.tsx): same labels, same order, same
 * icons. The lower group (Settings, Activity, Health Checks) is left out — this is a shot of where
 * the work happens, not a full chrome trace. */
const NAV: { label: string; icon: typeof BarChart3; active?: boolean; badge?: string }[] = [
  { label: "Dashboard", icon: BarChart3 },
  { label: "Documents", icon: ListChecks, active: true, badge: "7" },
  { label: "Sheets", icon: Table2 },
  { label: "Docu Library", icon: Library },
  { label: "Accounting", icon: Landmark },
  { label: "Automation", icon: Zap },
]

const statusStyle: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  review: "bg-indigo-50 text-indigo-700",
  dupe: "bg-red-50 text-red-700",
}

/** The homepage hero. The mock browser window and its scan-line sweep are decorative and never
 * react to anything, so — like .doc-scan in app/globals.css — they're plain CSS, not a client
 * component: nothing here needs an IntersectionObserver. */
export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-cream-200 bg-cream-50 pb-12 md:pb-24"
      style={{ backgroundImage: "radial-gradient(#e7dcc7 1px, transparent 1.4px)", backgroundSize: "24px 24px" }}
    >
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-[26rem] w-[26rem] rounded-full" style={{ background: "radial-gradient(circle, rgba(16,185,129,.10), transparent 70%)" }} />
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-8 px-5 pt-8 md:gap-14 md:pt-16">
        <div className="min-w-0 flex-1 basis-[400px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-cream-200 bg-white px-3.5 py-1.5 text-[0.78rem] font-semibold text-emerald-700 shadow-sm">
            <span className="db-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" style={{ animation: "db-pulse 2.4s ease-in-out infinite" }} />
            AI accounts payable, end to end
          </span>
          <h1 className="mt-4 text-balance font-display text-[clamp(2.05rem,4.6vw,4.05rem)] font-extrabold leading-[1.04] tracking-[-0.038em] text-stone-950 md:mt-5 md:leading-[1.02]">
            Bills in, however they arrive.{" "}
            <span style={{ backgroundImage: "linear-gradient(180deg,transparent 56%,#6EE7B7 56%,#6EE7B7 93%,transparent 93%)", padding: "0 .04em" }}>Coded, checked, approved</span>{" "}
            — ready to pay.
          </h1>
          <p className="mt-4 max-w-[34rem] text-pretty text-[1rem] leading-[1.55] text-stone-600 md:mt-6 md:text-[1.08rem] md:leading-[1.62]">
            Supplier, date, VAT, total — every detail read off the invoice, checked, and approved. Accounting is built in — or sync to the software you already use.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-3.5 md:mt-8">
            <div className="flex flex-col">
              <Link href="/signup" className="group inline-flex h-12 items-center rounded-[10px] bg-emerald-700 px-6.5 text-[0.98rem] font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,.08),0_10px_26px_rgba(4,120,87,.24)] transition-colors hover:bg-emerald-800">
                Start 14-day free trial
              </Link>
              <span className="mt-1.5 text-[0.76rem] text-stone-500">Best if you can upload a folder today.</span>
            </div>
            <div className="flex flex-col">
              <Link href="/demo" className="inline-flex h-12 items-center rounded-[10px] border border-stone-200 bg-white px-6 text-[0.98rem] font-semibold text-stone-900 shadow-sm transition-colors hover:bg-stone-50">
                Book a demo
              </Link>
              <span className="mt-1.5 text-[0.76rem] text-stone-500">Best for a walkthrough with your own AP.</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 basis-[440px]">
          <div className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,.09),0_2px_6px_rgba(15,23,42,.05)]">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 px-3.5 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="ml-2 text-[0.72rem] font-semibold text-slate-500">Extraction · March close · 42 documents</span>
            </div>
            <div className="flex flex-wrap">
              <div className="flex flex-none basis-[168px] flex-col border-r border-slate-200 bg-[#EEF1F2] p-2.5">
                <div className="flex items-center gap-1.5 px-1.5 pb-3 pt-0.5">
                  <BiteMark className="h-4 w-4 text-emerald-700" />
                  <span className="font-display text-[0.82rem] font-bold tracking-[-0.02em] text-stone-900">DocuBite</span>
                </div>
                <div className="px-1.5 pb-1 text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">Workspace</div>
                <div className="flex flex-col gap-0.5">
                  {NAV.map((item) => (
                    <div
                      key={item.label}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.74rem] ${
                        item.active
                          ? "bg-white font-semibold text-emerald-800 shadow-[0_1px_2px_rgba(15,23,42,.07),inset_0_0_0_1px_rgba(4,120,87,.10)]"
                          : "font-medium text-slate-600"
                      }`}
                    >
                      <item.icon aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2} />
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[0.62rem] font-bold text-white">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative min-w-0 flex-1 basis-[300px] overflow-hidden bg-white p-3.5 pb-3.5">
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600">Inbox · 12</span>
                  <span className="rounded-full bg-emerald-800 px-2.5 py-1 text-[0.68rem] font-semibold text-white">Review · 7</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600">Approved · 23</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600">Synced · 18</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600">Paid · 14</span>
                </div>
                <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_82px_70px] gap-2 border-b border-slate-100 px-2 pb-1.5 text-[0.63rem] font-bold uppercase tracking-wide text-slate-400">
                  <span>Document</span><span>Supplier</span><span className="text-right">Total</span><span className="text-right">Status</span>
                </div>
                <div className="flex flex-col">
                  {rows.map((row, i) => (
                    <div key={row.doc} className={`grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_82px_70px] items-center gap-2 px-2 py-2.5 text-[0.75rem] ${i < rows.length - 1 ? "border-b border-slate-50" : ""}`}>
                      <span className="truncate text-slate-700">{row.doc}</span>
                      <span className="truncate text-slate-700">{row.supplier}</span>
                      <span className="text-right font-semibold text-slate-900">{row.total}</span>
                      <span className="text-right"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-[0.64rem] font-bold ${statusStyle[row.status]}`}>{row.status}</span></span>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-2 text-[0.72rem] font-medium text-indigo-900">
                  January statement missing · 1 exact duplicate
                </div>
                <div aria-hidden className="db-sweep-bar pointer-events-none absolute inset-x-0 top-0 h-[30%]" style={{ background: "linear-gradient(to bottom, transparent, rgba(16,185,129,.16), transparent)", animation: "db-sweep 6s ease-in-out infinite" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

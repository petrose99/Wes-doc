"use client"

/**
 * PROTOTYPE — throwaway. Answers Wayfinder ticket #182 (map #177): "how dense can the operator
 * queue row get before it repeats Vic.ai's worst trait (uniform max density, no lighter state)?"
 *
 * Three row-height variants (A/B/C) of the same Bills data, each carrying the anatomy #179/#181
 * settled on: leftmost status glyph, Touchless pill, per-field confidence underlines, an aging
 * badge, a filter-chip header, and a row-click side panel (Review's split-pane, not a drawer).
 * Per-field confidence + touchless are NOT real fields on BillRow yet — fabricated
 * deterministically from documentId so the row has something to carry. Do not wire this to data.
 *
 * Constraints from #187 (hard, not decoration):
 *  - row controls spaced to >=24px centres (dev-mode "Show targets" overlay proves it, doesn't just claim it)
 *  - status is a distinct glyph per state, not colour alone (try the "Desaturate" toggle)
 *  - confidence underline + aging badge text hit >=4.5:1, aging badge never truncates
 *  - grid gets its own horizontal scroller at 320px; toolbar/chips/panel reflow instead of the whole page scrolling
 *
 * Not implemented here (out of scope for a reaction prototype): full roving-tabindex grid
 * keyboard nav, live-region announcements on panel open. Marked with TODO(#187) inline.
 *
 * Capture: this file lives on branch `prototype/dense-operator-row`, not main. Winner (row
 * height + anatomy) gets folded into the real Invoices shell once #179 ships the extracted shell.
 */

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import type { BillRow } from "@/models/bills"
import type { AgingBucket } from "@/lib/bills/due-date"

type Variant = "A" | "B" | "C"
const VARIANTS: { key: Variant; label: string; rowPad: string; fontSize: string }[] = [
  { key: "A", label: "A — Comfortable (56px)", rowPad: "py-3.5", fontSize: "text-sm" },
  { key: "B", label: "B — Standard (44px)", rowPad: "py-2.5", fontSize: "text-sm" },
  { key: "C", label: "C — Dense (32px)", rowPad: "py-1.5", fontSize: "text-[13px]" },
]

// Deterministic fake per-field confidence + touchless, keyed off documentId. PROTOTYPE ONLY.
function fakeSignals(documentId: string) {
  let h = 0
  for (const c of documentId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const conf = (seed: number) => 0.55 + ((h >> seed) % 45) / 100 // 0.55–0.99
  return {
    touchless: h % 5 === 0,
    fields: {
      supplier: conf(2),
      amount: conf(5),
      due: conf(8),
    },
  }
}

function confidenceClass(c: number) {
  // >=4.5:1 pairs against a white/slate-50 row bg — amber-700/emerald-700/red-700, not the -400/-500 shades.
  if (c >= 0.85) return "border-emerald-700"
  if (c >= 0.65) return "border-amber-700"
  return "border-red-700"
}

function StatusGlyph({ bucket, greyscale }: { bucket: AgingBucket | null; greyscale: boolean }) {
  // One shape per status so a greyscale desaturation still distinguishes them (WCAG 1.4.1).
  const cls = greyscale ? "grayscale" : ""
  if (!bucket) return <span className={`inline-flex h-4 w-4 items-center justify-center text-slate-400 ${cls}`} aria-hidden>—</span>
  if (bucket === "current") return <svg className={`h-4 w-4 text-emerald-700 ${cls}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd" /></svg>
  if (bucket === "1-30") return <svg className={`h-4 w-4 text-amber-700 ${cls}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M10 2a1 1 0 011 1v6a1 1 0 01-2 0V3a1 1 0 011-1zm0 12a1.25 1.25 0 110 2.5A1.25 1.25 0 0110 14z" /><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
  return <svg className={`h-4 w-4 text-red-700 ${cls}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.486 0l6.516 11.598c.75 1.334-.213 2.98-1.743 2.98H3.484c-1.53 0-2.493-1.646-1.743-2.98L8.257 3.1zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-.25-5.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z" clipRule="evenodd" /></svg>
}

function AgingBadge({ bucket }: { bucket: AgingBucket | null }) {
  if (!bucket) return <span className="text-xs text-slate-400">No due date</span>
  const map: Record<string, { text: string; cls: string }> = {
    current: { text: "On track", cls: "bg-emerald-100 text-emerald-800" },
    "1-30": { text: "1–30 days overdue", cls: "bg-amber-100 text-amber-800" },
    "31-60": { text: "31–60 days overdue", cls: "bg-orange-100 text-orange-900" },
    "61-90": { text: "61–90 days overdue", cls: "bg-red-100 text-red-800" },
    "90+": { text: "90+ days overdue", cls: "bg-red-200 text-red-900" },
  }
  const v = map[bucket]
  // Full text at every breakpoint — never collapse to "31-60d" or an icon. #187 flags this as the
  // one place density directly collides with a Level-A rule (1.4.1 colour-alone), so text wins.
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${v.cls}`}>{v.text}</span>
}

function TouchlessPill() {
  return <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">Touchless</span>
}

function ConfidenceField({ label, value }: { label: string; value: number }) {
  return (
    <span
      className={`inline-block border-b-2 pb-px ${confidenceClass(value)}`}
      aria-label={`${label} confidence ${Math.round(value * 100)}%`}
      title={`${label}: ${Math.round(value * 100)}% confidence`}
    >
      {label}
    </span>
  )
}

export function DensityRowPrototype({ workspaceId, bills }: { workspaceId: string; bills: BillRow[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const variant = (searchParams.get("variant") as Variant) ?? "B"
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showTargets, setShowTargets] = useState(false)
  const [greyscale, setGreyscale] = useState(false)
  const [narrow, setNarrow] = useState(false)

  const idx = VARIANTS.findIndex((v) => v.key === variant)
  const current = VARIANTS[idx] ?? VARIANTS[1]

  const setVariant = (key: Variant) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("variant", key)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
      if (e.key === "ArrowLeft") setVariant(VARIANTS[(idx - 1 + VARIANTS.length) % VARIANTS.length].key)
      if (e.key === "ArrowRight") setVariant(VARIANTS[(idx + 1) % VARIANTS.length].key)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [idx])

  const selected = useMemo(() => bills.find((b) => b.documentId === selectedId) ?? null, [bills, selectedId])

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border border-dashed border-violet-300 bg-violet-50 p-2 text-xs text-violet-800 ${greyscale ? "grayscale" : ""}`}>
        PROTOTYPE — ticket #182. Not production. Reacting to row density only; ignore everything else on this page.
      </div>

      {/* toolbar: view switcher -> sort -> inline filter chips, per #179's settled shell anatomy */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Invoices</span>
        <span className="text-slate-300">|</span>
        <button className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">Due date ↑</button>
        <span className="text-slate-300">|</span>
        {["All", "Unpaid", "Blocked", "Touchless"].map((chip) => (
          <button key={chip} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">{chip}</button>
        ))}
      </div>

      {/* split-pane: list left, detail right, both always mounted (#179) */}
      <div className={`flex gap-3 ${narrow ? "flex-col" : "flex-row"}`}>
        <div
          className={`min-w-0 flex-1 rounded-lg border border-slate-200 bg-white ${narrow ? "" : "overflow-x-auto"}`}
          role="grid"
          aria-label="Invoices"
          aria-rowcount={bills.length}
        >
          <div className={narrow ? "overflow-x-auto" : ""}>
            <table className={`w-full min-w-[640px] ${current.fontSize}`}>
              <thead>
                <tr role="row" className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="w-8 px-2 py-2" aria-hidden />
                  <th role="columnheader" aria-sort="none" className="px-3 py-2 font-medium">Supplier</th>
                  <th role="columnheader" aria-sort="none" className="px-3 py-2 font-medium">Amount</th>
                  <th role="columnheader" aria-sort="descending" className="px-3 py-2 font-medium">Aging</th>
                  <th className="px-3 py-2 font-medium">Signal</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => {
                  const sig = fakeSignals(bill.documentId)
                  const isSelected = bill.documentId === selectedId
                  return (
                    <tr
                      key={bill.documentId}
                      role="row"
                      aria-selected={isSelected}
                      tabIndex={0}
                      onClick={() => setSelectedId(bill.documentId)}
                      onKeyDown={(e) => { if (e.key === "Enter") setSelectedId(bill.documentId) }}
                      className={`cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 ${isSelected ? "bg-emerald-50" : ""}`}
                    >
                      <td role="gridcell" className={`relative px-2 ${current.rowPad}`}>
                        <span className={showTargets ? "relative inline-flex h-4 w-4 items-center justify-center after:absolute after:h-6 after:w-6 after:rounded-full after:border after:border-dashed after:border-sky-500" : ""}>
                          <StatusGlyph bucket={bill.agingBucket} greyscale={greyscale} />
                        </span>
                      </td>
                      <td role="gridcell" className={`px-3 ${current.rowPad}`}>
                        <div className="flex items-center gap-1.5 text-slate-800">
                          <ConfidenceField label={bill.supplier ?? "unknown supplier"} value={sig.fields.supplier} />
                          {sig.touchless && <TouchlessPill />}
                        </div>
                        {current.key !== "C" && <div className="text-xs text-slate-500 truncate max-w-[220px]">{bill.filename}</div>}
                      </td>
                      <td role="gridcell" className={`px-3 tabular-nums ${current.rowPad}`}>
                        <ConfidenceField label={bill.total !== null ? formatMoney(bill.total, bill.currencyCode) : "—"} value={sig.fields.amount} />
                      </td>
                      <td role="gridcell" className={`px-3 ${current.rowPad}`}>
                        <AgingBadge bucket={bill.agingBucket} />
                      </td>
                      <td role="gridcell" className={`px-3 ${current.rowPad}`}>
                        <button
                          className={`relative rounded-md border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-100 ${current.rowPad} ${showTargets ? "after:absolute after:inset-1/2 after:h-6 after:w-6 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border after:border-dashed after:border-sky-500" : ""}`}
                          onClick={(e) => { e.stopPropagation(); setSelectedId(bill.documentId) }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* detail pane: same pattern for narrow (overlay/full-width) and wide (side-by-side) */}
        <div
          role="region"
          aria-label={selected ? `Details: ${selected.invoiceNumber ?? selected.documentId}` : "Details"}
          className={`shrink-0 rounded-lg border border-slate-200 bg-white p-3 ${narrow ? (selected ? "w-full" : "hidden") : "w-72"}`}
        >
          {selected ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-800">{selected.supplier ?? "Unknown supplier"}</div>
                {narrow && <button className="text-xs text-slate-500" onClick={() => setSelectedId(null)}>Close</button>}
              </div>
              <div className="text-xs text-slate-500">{selected.filename}</div>
              <div className="text-slate-700">{selected.total !== null ? formatMoney(selected.total, selected.currencyCode) : "—"}</div>
              <div className="text-xs text-slate-500">Invoice {selected.invoiceNumber ?? "—"}</div>
              <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-500">Source document + field rationale panel goes here (#179's split-pane). Not built in this prototype.</div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Click a row to preview its detail pane in place.</p>
          )}
        </div>
      </div>

      {/* dev-only prototype controls, not part of the design being evaluated */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={showTargets} onChange={(e) => setShowTargets(e.target.checked)} /> Show 24px target centres</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={greyscale} onChange={(e) => setGreyscale(e.target.checked)} /> Desaturate (1.4.1 check)</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} /> Simulate 320px reflow</label>
      </div>

      <PrototypeSwitcher variant={variant} onChange={setVariant} />
    </div>
  )
}

function PrototypeSwitcher({ variant, onChange }: { variant: Variant; onChange: (v: Variant) => void }) {
  const idx = VARIANTS.findIndex((v) => v.key === variant)
  const current = VARIANTS[idx] ?? VARIANTS[1]
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm shadow-lg">
      <button aria-label="Previous variant" onClick={() => onChange(VARIANTS[(idx - 1 + VARIANTS.length) % VARIANTS.length].key)}>←</button>
      <span className="font-medium text-slate-700">{current.label}</span>
      <button aria-label="Next variant" onClick={() => onChange(VARIANTS[(idx + 1) % VARIANTS.length].key)}>→</button>
    </div>
  )
}

function formatMoney(amount: number, currency?: string | null): string {
  const currencyCode = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD"
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toFixed(0)} ${currency ?? ""}`.trim()
  }
}

import { formatAmount, formatQuantity } from "@/lib/matching/format"
import type { PoConsumption } from "@/models/po-matching"
import { withOrigin } from "@/lib/navigation/origin"
import Link from "next/link"

/** #228 Q8: the Purchase Order's Detail pane — Ordered / Invoiced / Remaining per line, then the
 * invoices matched to it, each a link. "Fully invoiced" is derived, never set by hand; "Received"
 * is data DocuBite lacks and is not shown as a column here. Server component: nothing to click
 * except the links. */
export function PoConsumptionPanel({ workspaceId, consumption, origin }: { workspaceId: string; consumption: PoConsumption; origin: string }) {
  const { lines, invoices, currencyCode } = consumption
  const invoicedLabel = consumption.total !== null
    ? `${formatAmount(consumption.invoicedAmount, currencyCode)} of ${formatAmount(consumption.total, currencyCode)}${consumption.invoicedPercent !== null ? ` · ${consumption.invoicedPercent} %` : ""}`
    : formatAmount(consumption.invoicedAmount, currencyCode)

  return <div className="space-y-4">
    <section aria-labelledby="po-consumption-title" className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <h3 id="po-consumption-title" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Consumption</h3>
        <div className="h-px min-w-6 flex-1 bg-slate-100" />
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${consumption.fullyInvoiced ? "bg-slate-100 text-slate-700 ring-slate-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`}>
          {consumption.fullyInvoiced ? "Fully invoiced" : "Open"}
        </span>
        <span className={`text-xs tabular-nums ${consumption.invoicedPercent !== null && consumption.invoicedPercent > 100 ? "text-red-700" : "text-slate-600"}`}>Invoiced {invoicedLabel}</span>
      </div>
      {lines.length === 0
        ? <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600">This purchase order has no line items to consume — nothing on an invoice can be matched line by line until it does.</p>
        : <div className="rounded-lg ring-1 ring-slate-200">
          <div className="overflow-x-auto rounded-lg">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="border-b border-slate-200 px-2 py-1.5 text-left">Line</th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-1.5 text-right">Ordered</th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-1.5 text-right">Invoiced</th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-1.5 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const over = line.ordered !== null && line.invoiced > line.ordered
                  return <tr key={line.index} className="even:bg-slate-50/50">
                    <td className="max-w-[16rem] truncate border-b border-slate-100 px-2 py-1.5 text-slate-800" title={line.description ?? undefined}>{line.description ?? <span className="text-slate-500">PO line {line.index + 1}</span>}</td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-800">{formatQuantity(line.ordered)}</td>
                    <td className={`border-b border-slate-100 px-2 py-1.5 text-right tabular-nums ${over ? "font-semibold text-red-700" : "text-slate-800"}`}>{formatQuantity(line.invoiced)}</td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-800">{line.remaining === null ? "—" : over ? <span className="text-red-700">0 · {formatQuantity(line.invoiced - (line.ordered as number))} over</span> : formatQuantity(line.remaining)}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </div>}
    </section>

    <section aria-labelledby="po-invoices-title" className="space-y-2">
      <div className="flex items-center gap-3 px-1">
        <h3 id="po-invoices-title" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Matched invoices</h3>
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      {invoices.length === 0
        ? <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600">No invoice is compared against this purchase order yet. An invoice that cites {consumption.poNumber ?? "its number"} is matched when it arrives; any other is linked from its row with Match manually.</p>
        : <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {invoices.map((invoice) => <li key={invoice.documentId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <Link href={withOrigin(`/workspaces/${workspaceId}/invoices/${invoice.documentId}`, origin)} className="min-w-0 truncate font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-emerald-500">
              {invoice.invoiceNumber ?? "Invoice"}{invoice.supplier ? <span className="font-normal text-slate-600"> · {invoice.supplier}</span> : null}
            </Link>
            <span className="flex items-center gap-2">
              <span className="tabular-nums text-slate-800">{formatAmount(invoice.total, invoice.currencyCode ?? currencyCode)}</span>
              <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${invoice.mismatchCount ? "bg-red-50 text-red-800 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`}>
                {invoice.mismatchCount ? `${invoice.mismatchCount} mismatch${invoice.mismatchCount === 1 ? "" : "es"}` : "Match"}
              </span>
            </span>
          </li>)}
        </ul>}
    </section>
  </div>
}

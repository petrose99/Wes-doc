import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
let p, s
const load = (f) => { p = `${root}/${f}`; s = readFileSync(p, 'utf8') }
const save = () => writeFileSync(p, s)
const rep = (a, b) => { if (!s.includes(a)) throw new Error(`missing in ${p}: ` + a.slice(0, 70)); s = s.replace(a, b) }

// QueueScreen: fieldKey on columns, fieldTable prop, ordering + width
load('components/queue/queue-screen.tsx')
rep(`import { confirmLeave } from "@/lib/client/unsaved-changes"`, `import { confirmLeave } from "@/lib/client/unsaved-changes"
import { orderColumnsByFieldTable, widthClassFor, type FieldTable } from "@/lib/configuration/field-table"`)
rep(`  /** Cell classes — alignment, tabular numerals, width hints. */
  className?: string
  render: (row: T) => ReactNode
}`, `  /** Cell classes — alignment, tabular numerals, width hints. */
  className?: string
  /** #252: the document field this column shows, so Admin › Configuration › Fields can order,
   * size or hide it in the system views. Columns without one (state, aging, PO) keep their place. */
  fieldKey?: string
  render: (row: T) => ReactNode
}`)
rep(`  columns: QueueColumn<T>[]
  /** Renders the bulk-selection checkbox column. Off for surfaces with no bulk actions. */`, `  columns: QueueColumn<T>[]
  /** #252: the workspace's saved field table for this queue's type, or null when none is saved.
   * Orders the field columns, drops Hidden ones and applies the width. */
  fieldTable?: FieldTable | null
  /** Renders the bulk-selection checkbox column. Off for surfaces with no bulk actions. */`)
rep(`  title, basePath, rows, rowId, detailIdFor, rowTitle, rowSubtitle, leading, columns, selectable = false, sortOptions = [], facets = [],`, `  title, basePath, rows, rowId, detailIdFor, rowTitle, rowSubtitle, leading, columns: rawColumns, fieldTable = null, selectable = false, sortOptions = [], facets = [],`)
rep(`  const visibleColumns = openId ? columns.filter((column) => column.narrow) : columns`, `  const columns = useMemo(() => orderColumnsByFieldTable(rawColumns, fieldTable).map((column) => {
    const width = widthClassFor(fieldTable, column.fieldKey)
    return width ? { ...column, className: \`\${column.className ?? ""} \${width}\` } : column
  }), [rawColumns, fieldTable])
  const visibleColumns = openId ? columns.filter((column) => column.narrow) : columns`)
save()

// Invoice queue
load('components/queue/invoice-queue.tsx')
rep(`import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"`, `import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import type { FieldTable } from "@/lib/configuration/field-table"`)
rep(`export function InvoiceQueue({ workspaceId, basePath, bills, minConfidencePercent, views, stat, initialSelectedId }: {
  workspaceId: string
  basePath: string
  bills: BillRow[]
  minConfidencePercent: number
  views?: ReactNode
  stat?: ReactNode
  initialSelectedId?: string | null
}) {`, `export function InvoiceQueue({ workspaceId, basePath, bills, minConfidencePercent, views, stat, initialSelectedId, fieldTable = null }: {
  workspaceId: string
  basePath: string
  bills: BillRow[]
  minConfidencePercent: number
  views?: ReactNode
  stat?: ReactNode
  initialSelectedId?: string | null
  /** #252: Admin › Configuration › Fields for invoices, when one has been saved. */
  fieldTable?: FieldTable | null
}) {`)
rep(`      key: "supplier", label: "Supplier", narrow: true, className: "min-w-[12rem]",`, `      key: "supplier", label: "Supplier", narrow: true, className: "min-w-[12rem]", fieldKey: "vendor",`)
rep(`      key: "number", label: "Invoice #", className: "whitespace-nowrap text-slate-700",`, `      key: "number", label: "Invoice #", className: "whitespace-nowrap text-slate-700", fieldKey: "invoice_number",`)
rep(`      key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900",
      render: (bill) =>`, `      key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", fieldKey: "total",
      render: (bill) =>`)
rep(`      key: "due", label: "Due", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700",`, `      key: "due", label: "Due", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700", fieldKey: "due_date",`)
rep(`      columns={columns}
      selectable
      sortOptions={SORTS}
      facets={INVOICE_FACETS}`, `      columns={columns}
      fieldTable={fieldTable}
      selectable
      sortOptions={SORTS}
      facets={INVOICE_FACETS}`)
save()

load('app/(app)/workspaces/[workspaceId]/(queue)/invoices/page.tsx')
rep(`import { listSavedViews } from "@/models/saved-views"`, `import { listSavedViews } from "@/models/saved-views"
import { getSavedFieldTable } from "@/models/field-configs"`)
rep(`  const [{ bills: allBills }, minConfidencePercent, savedViews, touchlessTrend] = await Promise.all([
    listWorkspaceBills({ workspaceId, onlyBlocked, onlyUnpaid, statusFilter, approvalFilter, onlyTouchless, poFilter }),
    getMinConfidencePercent(workspaceId),
    listSavedViews({ workspaceId, viewKey: "invoices", userId: user.id }),
    getTouchlessRateTrend(workspaceId),
  ])`, `  const [{ bills: allBills }, minConfidencePercent, savedViews, touchlessTrend, fieldTable] = await Promise.all([
    listWorkspaceBills({ workspaceId, onlyBlocked, onlyUnpaid, statusFilter, approvalFilter, onlyTouchless, poFilter }),
    getMinConfidencePercent(workspaceId),
    listSavedViews({ workspaceId, viewKey: "invoices", userId: user.id }),
    getTouchlessRateTrend(workspaceId),
    // #252: Admin › Configuration › Fields, when an owner has saved one for invoices.
    getSavedFieldTable(workspaceId, "invoice"),
  ])`)
rep(`    minConfidencePercent={minConfidencePercent}
    initialSelectedId={selectedDocumentId}`, `    minConfidencePercent={minConfidencePercent}
    fieldTable={fieldTable}
    initialSelectedId={selectedDocumentId}`)
save()

// Receipt queue
load('components/queue/receipt-queue.tsx')
rep(`      key: "merchant", label: "Merchant", narrow: true, className: "min-w-[12rem]",`, `      key: "merchant", label: "Merchant", narrow: true, className: "min-w-[12rem]", fieldKey: "merchant",`)
rep(`      key: "number", label: "Receipt #", className: "whitespace-nowrap text-slate-700",`, `      key: "number", label: "Receipt #", className: "whitespace-nowrap text-slate-700", fieldKey: "receipt_number",`)
rep(`      key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900",`, `      key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", fieldKey: "total",`)
rep(`      key: "date", label: "Purchase date", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700",`, `      key: "date", label: "Purchase date", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700", fieldKey: "purchase_date",`)
save()
console.log('ok')

import { BillsPage } from "../bills/page"

export const dynamic = "force-dynamic"

export default function InvoicesPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ blocked?: string; unpaid?: string; status?: string; approval?: string }>
}) {
  return BillsPage({ params, searchParams, pathSegment: "invoices", title: "Invoices" })
}


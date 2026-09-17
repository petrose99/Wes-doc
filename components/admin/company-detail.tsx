"use client"

import type { CompanyRow } from "@/lib/admin/companies"

/** #285 spec §5: the Detail pane for one company. Returned as JSX from the server page's
 * `loadDetail`, so `admin/layout.tsx` anchors it into the route's client manifest. Summary,
 * sticky bar and the card-less danger zone are build step 5; this is the anchored contract. */
export type CompanyDetailProps = {
  workspaceId: string
  row: CompanyRow
  organizationName: string
}

export function CompanyDetail({ row }: CompanyDetailProps) {
  return <dl className="px-5 py-4 text-sm text-slate-900">
    <dt className="text-slate-600">Name</dt>
    <dd>{row.name}</dd>
  </dl>
}

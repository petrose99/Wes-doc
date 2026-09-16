"use client"

import { Button } from "@/components/ui/button"
import { FileQuestion } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"

/** #268 spec §3.0: a hop that lands on a deleted or foreign document id with no valid `from`
 * (a bookmark, a pasted link) ends here, inside the workspace shell — never the framework 404.
 * With a valid `from` the page redirects to the origin with `gone=<id>` instead, so this is only
 * ever the no-origin case; the one link is the workspace's first queue. */
export default function DocumentGone() {
  const params = useParams<{ workspaceId?: string }>()
  const home = params?.workspaceId ? `/workspaces/${params.workspaceId}/invoices` : "/workspaces"

  return <main className="flex flex-1 items-center justify-center p-8">
    <div className="max-w-md space-y-4 text-center">
      <FileQuestion className="mx-auto h-12 w-12 text-slate-400" aria-hidden />
      <h1 className="text-2xl font-bold text-slate-900">That document was deleted.</h1>
      <p className="text-sm text-slate-500">It isn&apos;t in this workspace any more.</p>
      <Button asChild variant="outline"><Link href={home}>Back to Invoices</Link></Button>
    </div>
  </main>
}

"use client"

import { Button } from "@/components/ui/button"
import { FileQuestion } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"

/** Not-found boundary for every address under a workspace, rendered inside the shell so the rail
 * is still there. Reached by an unplugged surface's layout (lib/unplugged — Worksheets, Expenses,
 * Dictation bookmarks), the flagged-off /dashboard, and any typed deep link the segment below
 * does not catch itself. Without this the throw bubbled to Next's bare default 404 with no way
 * back but the browser — a dead end (Intent catalog, Category 9). */
export default function WorkspaceNotFound() {
  const params = useParams<{ workspaceId?: string }>()
  const home = params?.workspaceId ? `/workspaces/${params.workspaceId}/invoices` : "/workspaces"

  return <main className="flex flex-1 items-center justify-center p-8">
    <div className="max-w-md space-y-4 text-center">
      <FileQuestion className="mx-auto h-12 w-12 text-slate-400" />
      <h1 className="text-2xl font-bold text-slate-900">This page isn&apos;t here any more</h1>
      <p className="text-sm text-slate-500">The address doesn&apos;t open in this workspace. Your documents are where they were — start from the Invoices queue, or pick a destination from the rail.</p>
      <Button asChild variant="outline"><Link href={home}>Go to Invoices</Link></Button>
    </div>
  </main>
}

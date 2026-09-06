"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export function AutomationTabs({ workspaceId, active, reviewCount, reviewEnabled }: {
  workspaceId: string
  active?: "metrics" | "review"
  reviewCount: number
  reviewEnabled: boolean
}) {
  const pathname = usePathname()
  const base = `/workspaces/${workspaceId}`
  const current = active ?? (pathname.includes("/review") ? "review" : "metrics")

  return <nav className="flex gap-1 border-b border-[#e6ebf1]">
    <Link href={`${base}/automation`}
      className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${current === "metrics" ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
      Metrics
    </Link>
    {reviewEnabled && <Link href={`${base}/review`}
      className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${current === "review" ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
      Review queue
      {reviewCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{reviewCount}</span>}
    </Link>}
  </nav>
}

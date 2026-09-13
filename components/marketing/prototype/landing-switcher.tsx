"use client"

import { ArrowLeft, ArrowRight, FlaskConical } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"

const variants = [
  { key: "a", name: "The Close" },
  { key: "b", name: "The Narrative" },
  { key: "c", name: "The Platform" },
] as const

/** Development-only control for the three landing-page directions. */
export function LandingSwitcher({ current }: { current: "a" | "b" | "c" }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const currentIndex = variants.findIndex((variant) => variant.key === current)

  const move = (step: number) => {
    const next = variants[(currentIndex + step + variants.length) % variants.length]!
    const nextParams = new URLSearchParams(params.toString())
    nextParams.set("variant", next.key)
    router.replace(`${pathname}?${nextParams.toString()}`)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches("input, textarea, [contenteditable=true]")) return
      if (event.key === "ArrowLeft") move(-1)
      if (event.key === "ArrowRight") move(1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  // `move` intentionally closes over the current route/variant; rebind after either changes.
  }, [current, pathname, params])

  const label = variants[currentIndex]!
  return (
    <aside className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4" aria-label="Landing page prototype controls">
      <div className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950 p-1.5 text-white shadow-2xl shadow-slate-950/30">
        <button type="button" onClick={() => move(-1)} className="grid h-9 w-9 place-items-center rounded-full text-slate-300 transition hover:bg-slate-800 hover:text-white" aria-label="Previous prototype direction">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="flex items-center gap-2 border-x border-slate-700 px-3 text-xs font-semibold">
          <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
          {label.key.toUpperCase()} · {label.name}
        </span>
        <button type="button" onClick={() => move(1)} className="grid h-9 w-9 place-items-center rounded-full text-slate-300 transition hover:bg-slate-800 hover:text-white" aria-label="Next prototype direction">
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}

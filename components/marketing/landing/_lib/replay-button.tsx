import { RotateCcw } from "lucide-react"

export function ReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3.5 text-[0.83rem] font-semibold text-stone-700 transition-colors hover:border-emerald-200 hover:text-emerald-700"
    >
      <RotateCcw aria-hidden className="h-3.5 w-3.5" />Replay
    </button>
  )
}

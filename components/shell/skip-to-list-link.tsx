"use client"

/** #262: the workspace layout's second skip link. `QueueScreen` sets `document.body.dataset.queueList`
 * while mounted, so `[data-queue-list]` is what makes this visible on focus — a non-queue page never
 * shows it. Activating focuses the rows in place rather than navigating (no route change to make). */
export function SkipToListLink() {
  return <a href="#queue-list"
    onClick={(event) => {
      event.preventDefault()
      window.sessionStorage.setItem("docubite.pendingFocus", "rows")
      window.dispatchEvent(new Event("docubite:focus-rows"))
    }}
    className="sr-only hidden focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-slate-900 focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg [[data-queue-list]_&]:block">
    Skip to the list
  </a>
}

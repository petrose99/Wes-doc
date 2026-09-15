import { notFound } from "next/navigation"

/** Unplugged surfaces (CONTEXT.md): features the product no longer shows or routes to, kept only
 * so they can be brought back deliberately. Decided on #237, executed on #238 — every entry here
 * was signed off by name by the owner. Each segment's route directory carries a `layout.tsx` that
 * calls {@link unplugged}, so the address 404s without touching the pages, models or server
 * actions underneath; re-plugging is deleting that layout and re-linking the navigation. */
export const UNPLUGGED_SEGMENTS = ["worksheets", "files", "expenses", "dictation"] as const

export type UnpluggedSegment = (typeof UNPLUGGED_SEGMENTS)[number]

/** True when a workspace-relative pathname (`/workspaces/<id>/<segment>[/…]`) addresses an
 * unplugged surface. Used by the shell to make sure nothing lights up or links there. */
export function isUnpluggedPath(pathname: string): boolean {
  const match = /^\/workspaces\/[^/]+\/([^/?#]+)/.exec(pathname)
  return match != null && (UNPLUGGED_SEGMENTS as readonly string[]).includes(match[1])
}

/** The body of an unplugged route's `layout.tsx`: the address does not open. */
export function unplugged(): never {
  notFound()
}

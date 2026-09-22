/** #342 spec §4 — rail-width shared types/helpers. Plain module (no "use client"): server
 * components (account/page.tsx, layout.tsx) call `toRailWidth` at render time, and a "use
 * client" file's exports are all client references from the server's perspective even when
 * the export itself is a pure function — so these live outside rail-width-control.tsx. */

export type RailWidth = "icons" | "labels" | "auto"
export const RAIL_WIDTH_LABEL: Record<RailWidth, string> = { icons: "Icons only", labels: "Full labels", auto: "Auto" }

export function isRailWidth(value: string): value is RailWidth {
  return value === "icons" || value === "labels" || value === "auto"
}

/** `User.railWidth` is a plain String column (schema.prisma), not a Prisma enum — normalize
 * whatever it holds to a known state rather than trust it at every read site. */
export function toRailWidth(value: string): RailWidth {
  return isRailWidth(value) ? value : "auto"
}

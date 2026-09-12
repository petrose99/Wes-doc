/** Barrel for the shared workpaper substrate (#68). Jurisdiction packs and the close checklist
 * both import from here so the internal file split stays a shared-implementation detail. */
export type {
  ComputedWorkpaper,
  JurisdictionCode,
  Period,
  SourceRef,
  Workpaper,
  WorkpaperBill,
  WorkpaperColumn,
} from "./workpaper"
export { resolveWorkpaperById, resolveWorkpapersForJurisdiction } from "./workpaper"

export type { BillSnapshotInput, WorkspaceContext } from "./project-bill"
export { projectWorkpaperBill } from "./project-bill"

export { computeWorkpaper } from "./compute-workpaper"

export type {
  WorkpaperLayout,
  WorkpaperLayoutBox,
  WorkpaperLayoutColumn,
  WorkpaperLayoutRow,
} from "./layout-workpaper"
export { layoutWorkpaper } from "./layout-workpaper"

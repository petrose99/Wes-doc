/** Types for the close checklist (#95). The Prisma models are Close + CloseItem; the shapes
 * below are TypeScript-side companions — descriptor kinds, states, and the payload emitted
 * onto audit_events. Nothing here reaches into Prisma so the module is safe to import from
 * anywhere (server actions in #97, computation runners in #96, tests). */

/** Descriptor kinds that materialize into CloseItem rows at openClose time. Values are the
 * `kind` column on close_items. Kept as a string union rather than a TS enum, matching the
 * rest of the codebase (Gate.gateType, AuditEvent.type). */
export type CloseItemKind =
  | "bank-recon"
  | "ap-aging"
  | "unposted-bill-accruals"
  | "vat-workpaper"
  | "cross-border-review"

/** State machine for the parent Close row. */
export type CloseState = "open" | "locked"

/** State machine for one CloseItem. #97 flips to 'signed' and 'override'. */
export type CloseItemState = "pending" | "signed" | "override"

/** In-memory shape of an item-set descriptor. See lib/close/item-sets.ts for the ZA/LS
 * sets. `required=true` items block relock through the hard-gate check in #96; softDelta
 * flags the "asserted, soft delta" semantics for bank recon per decision #42. */
export type CloseItemDescriptor = {
  kind: CloseItemKind
  title: string
  required: boolean
  softDelta: boolean
}

/** The v1 lock snapshot written into close_items.lock_snapshot at lockClose time. Ticket #79
 * will extend this with `workspaceModeAtLock` and `reviewerOfRecord`; adding the fields to
 * this type is the extension point. */
export type CloseLockSnapshot = {
  packCode: string | null
  packVersion: string | null
  lockedAt: string
}

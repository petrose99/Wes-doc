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

/** The lock snapshot written into closes.lock_snapshot at lockClose time. Historical rows read
 * their banner/footer identity (firm vs SMB, and who the reviewer of record was) from here rather
 * than re-deriving from live workspace state, so a workspace flipping mode or losing its reviewer
 * after lock doesn't rewrite what a locked period says about itself. Extended by #79 to add
 * `workspaceModeAtLock` and `reviewerOfRecord`. */
export type CloseLockSnapshot = {
  packCode: string | null
  packVersion: string | null
  lockedAt: string
  /** Workspace mode (#41) captured at lock time — firm when the workspace had ≥1 reviewer at
   * lock, else smb. Historical read only; the live value can drift after lock. */
  workspaceModeAtLock: "firm" | "smb"
  /** The user this locked period is attributed to. In firm mode this is the reviewer of record
   * (v1: the actor who ran the lock — they must be a workspace member with reviewer or owner
   * capability). In SMB mode this is null: SMB workspaces have a signer of record who attests on
   * sign-off (#77) rather than a distinct reviewer. */
  reviewerOfRecord: { userId: string; name: string | null } | null
}

/** Typed read of a Close.lockSnapshot column value, returning null for an unlocked close or
 * for any row whose stored JSON doesn't have the current shape. Consumers (the workpaper
 * banner in #78, exports carrying reviewer-of-record) call this instead of casting Json —
 * the null branch also covers a locked row that was back-filled without a snapshot, which
 * the reader should treat as "no historical identity, fall back to live". */
export function readCloseLockSnapshot(value: unknown): CloseLockSnapshot | null {
  if (value == null || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const lockedAt = typeof raw.lockedAt === "string" ? raw.lockedAt : null
  if (lockedAt == null) return null
  const mode = raw.workspaceModeAtLock
  if (mode !== "firm" && mode !== "smb") return null
  const reviewer = raw.reviewerOfRecord
  let reviewerOfRecord: CloseLockSnapshot["reviewerOfRecord"] = null
  if (reviewer && typeof reviewer === "object") {
    const r = reviewer as Record<string, unknown>
    if (typeof r.userId === "string") {
      reviewerOfRecord = { userId: r.userId, name: typeof r.name === "string" ? r.name : null }
    }
  }
  return {
    packCode: typeof raw.packCode === "string" ? raw.packCode : null,
    packVersion: typeof raw.packVersion === "string" ? raw.packVersion : null,
    lockedAt,
    workspaceModeAtLock: mode,
    reviewerOfRecord,
  }
}

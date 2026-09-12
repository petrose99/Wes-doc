import { createHash, randomUUID } from "crypto"
import { prisma } from "@/lib/db"
import type { Prisma, PrismaClient } from "@/prisma/client"
import { headers } from "next/headers"

/** Recording who touched ePHI, from where, and whether it worked (HIPAA §164.312(b)).
 *
 * Every write in this app used to be an inline `prisma.documentAuditEvent.create` at the call
 * site, which meant sourceIp/userAgent were never captured — nothing read next/headers() for
 * them. This is the one place that does, so every audit event gets the same treatment for free.
 *
 * Two entry points because half the 18 pre-existing call sites run inside the job worker, which
 * has no request behind it — next/headers() throws there, not returns empty. */

type AuditClient = PrismaClient | Prisma.TransactionClient

export type AuditOutcome = "success" | "failure" | "denied"

export type AuditContext = { sourceIp: string | null; userAgent: string | null }

type AuditInput = {
  workspaceId: string
  documentId?: string | null
  actorId?: string | null
  type: string
  outcome?: AuditOutcome
  detail?: Prisma.InputJsonValue
}

/** Client address and user agent for the request currently being handled, or all-null when there
 * is none (the job worker, scripts, tests). x-forwarded-for can carry a comma-separated chain
 * (client, proxy, proxy...); the first entry is the client Vercel saw. */
export async function getRequestAuditContext(): Promise<AuditContext> {
  try {
    const list = await headers()
    const forwarded = list.get("x-forwarded-for")
    const sourceIp = (forwarded ? forwarded.split(",")[0]?.trim() : null) || list.get("x-real-ip")
    return { sourceIp: sourceIp || null, userAgent: list.get("user-agent") }
  } catch {
    return { sourceIp: null, userAgent: null }
  }
}

/** Builds the `data` object for a documentAuditEvent.create — a plain, synchronous function so it
 * can be used inside `prisma.$transaction([...])`'s array form, which requires each element to be
 * a lazy Prisma query rather than an awaited value. Fetch the context with
 * getRequestAuditContext() first, then pass it in here alongside the array's other operations. */
export function auditEventData(input: AuditInput, context: AuditContext = { sourceIp: null, userAgent: null }) {
  return {
    workspaceId: input.workspaceId,
    documentId: input.documentId ?? null,
    actorId: input.actorId ?? null,
    type: input.type,
    outcome: input.outcome ?? "success",
    detail: input.detail,
    sourceIp: context.sourceIp,
    userAgent: context.userAgent,
  }
}

async function write(client: AuditClient, input: AuditInput, context: AuditContext) {
  // try/catch, not .catch(): if client.documentAuditEvent were ever undefined the property access
  // throws SYNCHRONOUSLY, before any promise exists for .catch() to attach to — and an audit write
  // must not be able to break the action it is auditing, by any route. Same reasoning as the
  // recordSearch helper this replaces (lib/retrieval.ts).
  try {
    await client.documentAuditEvent.create({ data: auditEventData(input, context) })
  } catch (error) {
    console.error(`[audit] failed to record ${input.type}:`, error instanceof Error ? error.message : error)
  }
}

/** Records one audit event for a request the app is currently handling — reads IP and user agent
 * off next/headers(). Use from route handlers, server actions, and page/layout renders. Pass a
 * transaction client when the write must land atomically with the change it describes; omit it to
 * write against the pool directly. Never call from the job worker — see recordSystemAudit. */
export async function recordDocumentAudit(input: AuditInput, client: AuditClient = prisma) {
  await write(client, input, await getRequestAuditContext())
}

/** Records one audit event with no request behind it: the job worker, background retries,
 * extraction/embedding completion. sourceIp and userAgent are always null — there is nothing to
 * read them from, and calling getRequestAuditContext() here would just throw and be swallowed. */
export async function recordSystemAudit(input: Omit<AuditInput, "actorId">, client: AuditClient = prisma) {
  await write(client, { ...input, actorId: null }, { sourceIp: null, userAgent: null })
}

// --------------------------------------------------------------------------------------------
// Workflow audit trail (touchless-AP gates from #40 + close checklist from #42).
//
// Separate write path from recordDocumentAudit/recordSystemAudit above: those cover HIPAA
// document access; these cover operational state transitions (a gate blocked, a close item was
// signed off). Different table (audit_events), different retention constraint, different
// consumers. Idempotent by (type, subjectId, hash(payload)) so callers can re-emit the same
// event as many times as recomputation demands and the trail collapses to one row per real
// change — see #42's "computed logged only on value change".
// --------------------------------------------------------------------------------------------

/** The 12 workflow event types closed by decision tickets #40 (gates) and #42 (close). Union of
 * string literals — not a Prisma enum or a TS enum — because the DB column is a plain text
 * column (see AuditEvent.type in schema.prisma) and adding a new type is a code change with no
 * migration. The `AuditEventType` object is a runtime-usable form of the same union, so callers
 * can write `AuditEventType.GATE_BLOCKED` instead of a stringly-typed "gate.blocked". */
export type AuditEventTypeName =
  | "gate.blocked"
  | "gate.overridden"
  | "gate.resolved"
  | "close.opened"
  | "close.item.computed"
  | "close.item.signed"
  | "close.item.unsigned"
  | "close.item.override"
  | "close.item.attested"
  | "close.period.locked"
  | "close.period.reopened"
  | "close.period.relocked"

export const AuditEventType = {
  GATE_BLOCKED: "gate.blocked",
  GATE_OVERRIDDEN: "gate.overridden",
  GATE_RESOLVED: "gate.resolved",
  CLOSE_OPENED: "close.opened",
  CLOSE_ITEM_COMPUTED: "close.item.computed",
  CLOSE_ITEM_SIGNED: "close.item.signed",
  CLOSE_ITEM_UNSIGNED: "close.item.unsigned",
  CLOSE_ITEM_OVERRIDE: "close.item.override",
  /** #77: SMB signer-of-record attests on every sign-off, emitted right before
   * close.item.signed. Payload keeps the versioned attestation text so rewording the constant
   * doesn't rewrite what past signers actually agreed to — bump SMB_ATTESTATION_VERSION and old
   * rows keep their old {attestationText, attestationVersion}. Firm workspaces never emit this. */
  CLOSE_ITEM_ATTESTED: "close.item.attested",
  CLOSE_PERIOD_LOCKED: "close.period.locked",
  CLOSE_PERIOD_REOPENED: "close.period.reopened",
  CLOSE_PERIOD_RELOCKED: "close.period.relocked",
} as const satisfies Record<string, AuditEventTypeName>

export type AuditSubjectType = "bill" | "close" | "close_item" | "gate"

export type WriteAuditEventInput = {
  workspaceId: string
  /// Null when the event is emitted by the job worker or a scheduled recompute (see #42: the
  /// assistant auto-computes on open, no user in the loop). Required otherwise.
  actorId?: string | null
  type: AuditEventTypeName
  subjectType: AuditSubjectType
  subjectId: string
  payload?: Prisma.InputJsonValue
}

/** JSON.stringify with sorted keys, so `{a:1,b:2}` and `{b:2,a:1}` hash to the same value.
 * Idempotency has to survive key-order variance across call sites; the alternative is asking
 * every caller to hand-sort, which they will not. */
function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`
}

/** Runtime type-guard for AuditClient with an `.auditEvent` model — used to give an actionable
 * error when the caller passes a client from a schema that hasn't been regenerated yet, rather
 * than the unreadable `Cannot read properties of undefined (reading 'create')` you get otherwise. */
type AuditEventClient = AuditClient & { auditEvent: { create: (args: unknown) => Promise<unknown> } }
function hasAuditEventModel(client: AuditClient): client is AuditEventClient {
  return typeof (client as { auditEvent?: unknown }).auditEvent === "object"
}

/** Idempotent write against `audit_events`. Callers pass the event; the helper hashes the
 * payload and inserts. A duplicate insert (same type + subject + payload) is caught on the
 * unique index and swallowed — the semantics are set-membership, not append. A payload change
 * yields a new hash and a new row, which is exactly what "logged only on value change" wants.
 *
 * Never throws for an audit-write failure: mirroring recordDocumentAudit above, an audit log
 * must not be able to break the action it is auditing. */
export async function writeAuditEvent(input: WriteAuditEventInput, client: AuditClient = prisma): Promise<void> {
  if (!hasAuditEventModel(client)) {
    console.error(`[audit] writeAuditEvent called with a client whose schema has no AuditEvent — run \`npm run db:generate\``)
    return
  }
  const payload = input.payload ?? null
  const payloadHash = createHash("sha256").update(canonicalJson(payload)).digest("hex")
  try {
    await client.auditEvent.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        actorId: input.actorId ?? null,
        type: input.type,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        payload: payload as Prisma.InputJsonValue,
        payloadHash,
      },
    })
  } catch (error) {
    // P2002 = unique constraint on (type, subject_id, payload_hash): the same event was already
    // recorded. That is the idempotent path, not a failure — swallow it silently. Anything else
    // gets logged so we notice, but is still swallowed so the caller keeps running.
    if (isPrismaUniqueViolation(error)) return
    console.error(`[audit] failed to record workflow event ${input.type}:`, error instanceof Error ? error.message : error)
  }
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
}

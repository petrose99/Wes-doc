# DocuBite — Degraded-Pipeline UX, IA Audit, Worker Race-Safety: Handoff

_Last updated: 2026-09-11. Everything below is on branch `claude/blueprint-9e2929`, uncommitted in
the worktree at `.claude/worktrees/extracted-data-search-ai-ed0cdb`. `tsc --noEmit` is clean (only
pre-existing, unrelated errors remain — see "Pre-existing, not yours" below); 97 relevant tests pass._

Four pieces of work this session, in the order they happened. The first three are analysis/design
that informed what got built; the last is the actual implementation.

---

## 1. Service blueprint (analysis only, no code)

Mapped the whole system: ingestion converges on one chokepoint (`lib/ingestion.ts`), async work
drains through one worker loop (`worker/job-worker.ts`). Full writeup and an HTML diagram were sent
to the user directly (not saved to a repo file) — ask them to resurface it if the next session
needs it, or re-run `/blueprint` for a fresh pass.

**Key finding carried forward:** failures come in two shapes — transient/systemic (provider outage,
quota) that self-heals, and permanent/per-document that never will. The UI didn't distinguish them.
This is what item 4 below fixes.

## 2. Degraded-pipeline journey (analysis only, no code)

`/journey` design for what a user experiences when the pipeline degrades — three arcs: the person
watching the inbox, the absent email sender, and the API consumer. Also not saved to a file. The
"problem is on our side" copy doctrine and the "one bounce, no delay emails" policy for email
senders both came from this and are now implemented (item 4).

## 3. IA audit of the workspace rail (analysis + two small label fixes, done)

`/organize` audit of `components/shell/sidebar.tsx`. Two findings were real and are **already
fixed and committed to the worktree**:

- **"Docu Library" → "Docu Search"**, renamed everywhere (sidebar, marketing hero/landing copy,
  onboarding tour, page titles, code comments) — see the diff on `components/shell/sidebar.tsx`,
  `components/marketing/landing/{hero,library}.tsx`, `lib/section-copy.ts`,
  `app/(app)/workspaces/[workspaceId]/{library,files}/page.tsx`, `models/documents.ts`,
  `components/pipeline/ready-banner.tsx`. Reason: "Docu Library" and "Documents" gave users no way
  to know which of two rail entries to click for "find an old invoice" — the rename disambiguates
  by task (search vs. work queue) without adding a new rail slot.
- **Approvals-under-Settings** — turned out to already be fixed by an earlier pass (see the comment
  at `lib/modules/index.ts:48`). Nothing to do.

**Deliberately NOT done, and don't re-flag it:**
- **Sheets label vs. `/files` route mismatch.** The rail says "Sheets", the route is `/files`, and
  `/files` is referenced in 53 files — many of them the data model (`models/files.ts`,
  `lib/document-storage.ts`, API routes), not just navigation. User explicitly said skip this for
  now; it needs its own scoped pass, not a drive-by rename.
- **Expenses / Dictation / search being absent from the rail.** These are *intentional* curation,
  confirmed by the user — not a regression. There's a standing memory
  (`rail-omissions-are-deliberate.md`) telling future sessions not to re-flag this. Read it before
  auditing the rail again.

## 4. Degraded-pipeline UX implementation (code, done)

This is the bulk of the session's diff. Implements the "problem is on our side" doctrine and the
email-sender notification policy from item 2.

### New file: `lib/document-error-copy.ts`

Client-safe (no server deps — importable from `"use client"` components, unlike
`lib/document-processing.ts` which pulls in prisma/sharp/provider SDKs). Exports
`describeDocumentError(errorCode)`, returning either a permanent-failure shape
(`{permanent: true, message, action}`, e.g. "This file has too many pages to process. Split it into
smaller files and upload again.") or a transient one (`{permanent: false, message: "We couldn't
process this — the problem is on our side. It's safe and stored."}`).

**⚠️ Known drift risk, needs attention:** its `PERMANENT_ERROR_CODES` set is a **manually
duplicated mirror** of `lib/document-processing.ts`'s `PERMANENT_ERROR_CODES` (line ~53) and
`lib/document-transcription.ts`'s `PERMANENT_ASR_ERROR_CODES` (line ~40), because those two live in
server-only modules a client component can't import. **If a future session adds a new permanent
error code to either server-side list, it must also add it here, or the UI will call a genuinely
permanent failure "our side, it'll be fine" — the opposite of honest.** A real fix would be
extracting just the code lists (not the modules) into a shared client-safe file and having both
server files import from there instead of declaring their own arrays — worth doing next time
someone touches either list.

### Wired into the two existing failure surfaces

- `components/extract/use-extraction-progress.ts` — the inbox toast on a failed document now uses
  `describeDocumentError` instead of `errorCode.replaceAll("_", " ")`.
- `components/extract/extract-panel.tsx` — the staged-upload row's error text, same swap.

**Note on scope:** by the time a document's `status` reaches `"failed"`, it's *always* terminal —
`failDocumentJob` in `lib/document-processing.ts` only sets `status: "failed"` for permanent errors
or once 5 attempts are exhausted; a transient failure keeps `status: "queued"` with a backoff retry
and is invisible to the UI today. So `describeDocumentError`'s "permanent: false" branch is really
"terminal, but not a code we know will never heal" (attempts exhausted on an otherwise-transient
code) — it deliberately does **not** claim "will retry automatically", because by the time the UI
sees it, retries have already stopped. That's honest but incomplete: the journey's Stage 1 (a live
"N documents queued, retrying automatically" banner while status is still `"queued"`) was **not**
built this session — it's a bigger surface (aggregating same-code failures across a workspace,
a distinct "queued — retrying" visual state) that deserves its own pass. This is the single biggest
piece of the journey design still unbuilt.

### Bulk "Retry" — `components/pipeline/bulk-action-bar.tsx`

New button, visible only at `stage === "inbox"` (where `status: "failed"` documents live per
`lib/documents/stages.ts`'s `stageToStatusFilter`). Calls the existing `reprocessDocumentAction`
across the selection, same fire-and-count-successes pattern the existing "Re-extract" bulk action
already uses — a mixed selection silently skips rows that error with `document_already_processing`
rather than surfacing N toasts.

### Workspace notification on permanent email-ingested failures

New DB column: `Document.sourceEmail` (migration
`prisma/migrations/20260911000000_add_document_source_email/migration.sql`, Prisma client already
regenerated via `npm run db:generate` — **a fresh clone/session needs to run that too**, or
`prisma.Document` won't have the field in its types). Populated from all four
`createIngestionItem` call sites in `models/inbound-email.ts` (`sourceEmail: effectiveFrom`),
threaded through `lib/ingestion.ts` → `models/documents.ts::createDocumentFromBuffer`.

In `lib/document-processing.ts`'s `failDocumentJob`, a **permanent** failure on a document with
`sourceEmail` set now sends one email to the workspace's **owners** (via
`resolveOwnerRecipients`, newly exported from `models/reminders.ts`) using the existing
`sendReminderEmail`/Resend path — never to the original sender. Copy matches the journey exactly:
*"A document emailed by X on [day, time] couldn't be processed: [reason]. It's in your inbox to
handle."* **Transient failures send nothing** — this was a deliberate policy from the journey
("don't send 'your document is delayed' emails — trains senders to expect chatter, reads as
phishing bait"). The sender's own signal stays the existing mail-level bounce
(`sender_not_allowed` in `models/inbound-email.ts`), unchanged.

Best-effort throughout: notification failures are caught and logged, never block the job's own
failure handling.

---

## Pre-existing, not yours

`tsc --noEmit` shows errors in `models/expense-claims.ts`, `models/review-tasks.ts`, and
`app/(app)/workspaces/[workspaceId]/(chrome)/expenses/page.tsx` — a `Decimal | null` vs
`number | null | undefined` mismatch on `WorkflowStageInput.minAmount`. Confirmed present before
this session's changes; nothing here touches those files.

## Separately: worker race-safety finding (analysis only, not acted on)

Also investigated this session, not yet fixed: the "one worker loop" claim from the blueprint is
**half true**. Race-safe (atomic claim-then-check-count pattern): document jobs
(`lib/document-processing.ts:316`), webhook deliveries (`lib/webhook-delivery.ts:36`), integration
pushes, Bigcapital provisioning. **NOT race-safe** (read-then-act, no per-row claim) — a second
worker would double-fire these:
- `sendReviewTaskReminders` / `sendExpenseClaimReminders` (`models/reminders.ts:33,68`) — could
  double-send the same reminder email.
- `syncDueLedgerConnections` (`lib/health/sync.ts:144`) — worse: its retry/backoff state
  (`syncHolds`) is an **in-memory Map local to one process**, so a second worker has no idea the
  first just failed and is backing off.
- `runDueHealthChecks` (`models/health.ts:562`) — could run the same workspace's health check
  twice in one tick.

**Do not run a second `worker` container until these are fixed** (or accept the duplicate-email/
double-run risk knowingly). Fixing them means giving each the same atomic
`updateMany({where: {..., status: "due"}, data: {...}}).count` claim pattern the safe three
already use, and moving `syncHolds` into the DB (a column on `IntegrationConnection`, most likely).

## Suggested next steps, in priority order

1. **Stage-1 banner** (journey item, unbuilt) — the live "N documents queued, retrying
   automatically" workspace-level banner. Biggest remaining UX gap from the journey.
2. **Fix the worker race-safety gaps** above, if/when horizontal scaling of the worker is planned.
3. **Sheets/`/files` route rename** — scoped separately, 53-file blast radius, needs its own pass.
4. **Collapse the duplicated `PERMANENT_ERROR_CODES`** into one client-safe source of truth (see
   the ⚠️ note above) before the three lists drift.

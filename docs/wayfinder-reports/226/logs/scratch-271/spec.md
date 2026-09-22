# Spec — #271 Approval notice (map #226)

Builds what #246 decided (resolution comment) under the glossary term **Approval notice** (CONTEXT.md:108).
Mode: **Operate** for every surface here (email body is a task surface: one job — open the row).
Research pointers live in `271.handoff.md` § Research digest; this file states behaviour, copy, states and a11y.

## 0. Context (intent `context`)
- **User**: an Approver — a finance owner or a named stage approver who is not in DocuBite all day; reads email on a phone between meetings (390) or in a desktop client (600px column). Wants: know *that* something waits, *what* it is, and get to it in one tap. Does not want: a stream of one-per-invoice mail, mail about their own actions, mail they cannot switch off.
- **Starter**: the person who started a run (`ReviewTask.createdById`); only ever hears about a *send back for review*, with the reason.
- **Admin**: sees one sentence under Admin › Configuration when email is not configured.
- **Constraints**: Resend via `lib/email.ts`; drain tick is the only scheduler; per-person hourly floor; email clients (no JS, table layout, no web fonts guaranteed); plain-text part always.
- **Ethical stance**: informative, never persuasive. Opt-out is one click, signed, no login (Category 6 *Inaccessible unsubscribe* and Category 2 *Opt-out burden* explicitly rejected). The email never decides anything (no "Approve" button in mail — one-click approval from a forwarded link is the hidden-consequence risk). No open/click tracking.
- **Success**: an Approver reaches the row from the mail in ≤ 2 taps including sign-in; ≤ 1 notice per person per hour; zero notices about the person's own acts; the switch-off round trip is one click.

## 1. Data and sender (behaviour, no UI)
Schema (`prisma/schema.prisma`):
- `ReviewTask.stageReachedAt DateTime?` — set to `now()` in `createReviewTask` (stage 0) and whenever `currentStageIndex` changes in `decideReviewTaskStage`; also on `sendReviewTaskBackForReview` (the task returns to a stage). Reminders' "pending since" = `stageReachedAt ?? createdAt`.
- Per-(task, person) record `ApprovalNotice { id, reviewTaskId, userId, workspaceId, kind: "reached"|"nudge"|"sent_back", sentAt, stageIndex, stageReachedAt }` — `stageReachedAt` copies the task's value at send time, so a **restart after a send-back (new `stageReachedAt`, same stage index) counts as new again** (critic P1). Nudge cap: `count(kind="nudge" AND reviewTaskId AND userId AND stageReachedAt = task.stageReachedAt) < 2` (cap is per stage visit). This replaces `ReviewTask.lastReminderAt` as the reminder clock for Approvals (column stays; expense sweep still uses its own).
- `WorkspaceMember.noticeLastSentAt DateTime?` — the 60-minute floor, per person per workspace.
- `User.approvalNoticeEmails Boolean @default(true)` — the switch; `User.approvalNoticeStopToken` not stored: the stop link token is `base64url(payload) + "." + HMAC-SHA256("approval-notice-stop:" + payload)` with payload `userId:workspaceId:issuedAt` (purpose tag = domain separation from `lib/webhook-signature.ts`; same secret `INTERNAL_WORKER_SECRET`; constant-time compare; rejected when `issuedAt` is older than 90 days). Helper `lib/notices/stop-token.ts` `signStopToken` / `verifyStopToken`.

Sender `models/approval-notices.ts` `sendApprovalNotices(now)` — called from `app/api/internal/jobs/process/route.ts` on every drain hit, before `sendDueReminders`:
1. Candidates: `ReviewTask` open (`status in review`), `stageReachedAt` not null, document not cancelled/decided.
2. For each task: stage = `workflow.stages[currentStageIndex]`; deciders = `approverIds` if non-empty else workspace owners (never every member — `canDecideStage`, glossary). Drop the task if `computeApprovalEligibility` says Not eligible (#227: waits until it flips — `stageReachedAt` stays, so it is picked up on the tick after it flips).
3. Per decider, exclude: `createdById === user`, users who already decided this stage, users with `approvalNoticeEmails=false`, users with no verified email, users removed from the workspace (membership check at send time, not at reach time).
4. New for a person = tasks with no `ApprovalNotice(kind="reached")` row for (task, user) whose `stageReachedAt` equals the task's current `stageReachedAt`. A task is listed in **one** section only: if it qualifies as new it goes under New, never also under Still waiting (nudge eligibility starts from the `reached` row's `sentAt`).
5. Floor: if `member.noticeLastSentAt > now − 60 min` → skip this person this tick (nothing lost; next tick re-evaluates). Nothing new → no email, no stamp.
6. Send one email per (person, workspace). Success → insert `ApprovalNotice` rows + stamp `noticeLastSentAt`. Failure (`sendReminderEmail` throws / Resend error) → no rows, no stamp, log once; the next tick retries. Never throws out of the drain.
7. Not configured (`!isEmailConfigured()`): return `{ skipped: "email-not-configured" }`; in-app remains the only signal (Approvals badge, #232).
8. Nudges (re-pointed `sendReviewTaskReminders`): a task with a `reached` row for this person ≥ 48h old (same `stageReachedAt`), last nudge ≥ 72h ago (or none), `nudge` rows for (task, user, stageReachedAt) < 2 → included in the same coalesced mail under a "Still waiting" heading (subject rule §3). Nudges obey the switch, the floor and all exclusions above; expense-claim sweep untouched (#272).
9. Send back for review: `sendReviewTaskBackForReview` calls `sendSentBackNotice(task, actor, reason)` directly (not coalesced — it is a reply to one act) → one email to `createdById` unless it is the actor, their switch is off, or they are no longer a member of the workspace (same membership check as step 3). Obeys no floor and **does not stamp `noticeLastSentAt`** — exception stated: the floor exists to stop per-invoice fan-out to approvers; a send-back is one mail per human decision and must not delay the starter's next reached notice.
10. Kick: `startApprovalOnInvoice` / `startWorkflowOnReviewTask`, `decideReviewTaskStage` (when the stage advances) and `sendReviewTaskBackForReview` (the returned stage's approvers) fire-and-forget POST the drain (copy `kickEmbedJob`: 5s abort, swallowed). So the notice lands within seconds, not at the next cron. Cron cadence: cron-job.org drives the drain (`HANDOFF-DYNAMIC-DICTATION-AND-PROD-INFRA.md:133`); the interval is not recorded there — **assumption: ≤ 15 min**, so a person skipped by the floor waits at most floor + 15 min. Record the actual interval in the area primer at close.

Time-axis (fortify B6): decided between reach and tick → not in the mail (step 1 re-reads). Approver removed / stage reassigned between reach and tick → excluded (step 3 reads the current stage). Person opens link after someone else decided → queue arrival's `decidedText` notice (already built, #268/#257). Two ticks overlap (cron + kick) → `ApprovalNotice` insert inside the same transaction as the send stamp; a duplicate send within the same minute is bounded by the floor check re-read inside the transaction (`SELECT … FOR UPDATE` on the member row).

## 2. Deep link and arrival
- One row → `/workspaces/<ws>/approvals/invoices?doc=<documentId>&via=notice`; several → `/workspaces/<ws>/approvals/invoices?via=notice`, and each row in the body links its own `?doc=` URL.
- Approvals page (server): when `searchParams.via === "notice"` write `DocumentAuditEvent` type `notice.opened` (actor = viewer, doc = `doc` param if present) once per arrival, then render unchanged; the `via` param is not echoed into any link the page emits.
- Sign-in return: `proxy.ts` appends `?next=<pathname+search>` when redirecting to `/login`; accepted only when it matches `^\/(?![\/\\])` (relative, not protocol-relative, not backslash — browsers normalise `\`→`/`) and does not start with `/login` (no loop); anything else is ignored and the default destination applies; `LoginForm` and the Google button use it as `redirectTo`; MFA challenge already carries `next`. Wrong-workspace account signs in → existing "not a member" page; no special casing.

## 3. The email (`components/emails/approval-notice-email.tsx` on `email-layout.tsx`)
Copy matrix (articulate). `‹Workspace›` = workspace name; amounts `formatMoney(amount, doc.currency ?? workspace.baseCurrency)`; dates `Intl.DateTimeFormat(locale "en-GB", { day, month short, year }, timeZone: workspace.timezone)` → "16 Sep 2026".

| Case | Subject | Heading (h1) |
|---|---|---|
| 1 invoice reached | `‹Supplier› · ‹amount› needs your approval — ‹Workspace›` | `‹Supplier› needs your approval` |
| 1 expense claim reached (#273, when claims are rows) | `‹Claimant› · ‹amount› expense claim needs your approval — ‹Workspace›` | `‹Claimant›'s expense claim needs your approval` |
| n ≥ 2 reached (any mix) | `n invoices need your approval — ‹Workspace›` (`n approvals need your approval` when the mix includes a claim) | `n invoices need your approval` |
| nudge only, 1 | `Still waiting: ‹Supplier› · ‹amount› — ‹Workspace›` | `Still waiting on you: ‹Supplier›` |
| nudge only, n | `Still waiting: n invoices — ‹Workspace›` | `Still waiting on you: n invoices` |
| reached + nudge mix | subject from the reached rows; body has two sections `New` / `Still waiting` | as reached |
| sent back | `Sent back for review: ‹Supplier› · ‹amount› — ‹Workspace›` | `‹Actor name› sent ‹Supplier› back for review` |

Body structure (top → bottom), 600px container, all text left-aligned (overrides the layout's centred h2 — pass `align="left"`):
1. Wordmark "DocuBite" 14px semibold slate-900 (text, no logo image).
2. h1 22px/28px semibold slate-900, wraps.
3. Lead 15px slate-600: reached → `These reached a stage you can decide.`; nudge → `Still undecided after ‹d› days. Nothing happens until someone decides.`; sent back → `Reason: “‹reason›”` in a quoted block (reason wraps, no truncation; empty reason → `No reason was given.`).
4. List: one `<tr>` per Approval, 16px top padding, hairline `#e2e8f0` between rows. Line 1: `<a>` **Supplier** 16px semibold slate-900 (link colour inherits, underline) · Invoice # 14px slate-600 · Amount 16px tabular slate-900. Line 2 13px slate-500: `started by ‹name› · ‹date›`; nudge rows append ` · waiting ‹d› days`. Long supplier/name wraps (`word-break: normal; overflow-wrap: anywhere` on the cell). Each row's link = that row's `?doc=` URL. Sent-back mail has one row.
5. Button: `Open in DocuBite` — 44px tall, emerald `#047857` fill, white 15px semibold, `border-radius 6px`, block on 390 (`width:100%`), auto on 600; href = §2 link. **Never** "Approve"/"Decide". Plain-text: the URL on its own line under `Open in DocuBite:`.
6. Footer 13px slate-500, two sentences on their own lines: `You get this because you can decide these approvals in ‹Workspace›.` (sent-back variant: `You get this because you started this approval.`) then `Stop these emails` as a link (`/notices/stop?t=…`) — 13px underlined slate-600 (≥ 4.5:1), never lower contrast than the sentence above it (Category 6 *Low-contrast opt-out*). Third line: `Or change it under Account › Approval emails.` (plain — the account menu is not URL-addressable; phone Account page is: link to `/workspaces/<ws>/account`).
7. Resend call: `{ react, text: render(react, { plainText: true }), headers: { "List-Unsubscribe": "<POST /notices/stop?t=…>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }`; tracking off (not set on the request; document that domain-level tracking must stay off in `docs/agents/areas/approvals.md`).

Preview route `app/dev/emails/approval-notice/route.ts` — `NODE_ENV !== "development"` → 404. `?case=single|plural|nudge|mixed|sent-back|long-names|claim` renders the HTML part; `&text=1` returns the plain-text part as `text/plain`. Fixtures in `lib/notices/fixtures.ts`. Capture at 600 and 390 for every case.

## 4. Per-user switch — "Approval emails"
Term: **Approval emails** (menu row, dialog title, phone panel). Sentence under the control: `Email me when an Approval needs me.` Saved value is a `User` column via server action `setApprovalNoticeEmailsAction(enabled)` (`app/(app)/workspaces/[workspaceId]/actions.ts`), `revalidatePath` on the account page.

Desktop (`components/shell/account-menu.tsx`): new `role=menuitem` button after "Keyboard shortcuts", icon `Mail`, label "Approval emails", suffix `Off` (text-xs slate-500) when disabled, `aria-label="Approval emails, off"` when off. Click → closes the menu, opens `ApprovalEmailsDialog` (`components/ui/dialog.tsx`, `initialFocus` = the switch): title "Approval emails"; body sentence `Email me when an Approval needs me.` + `Switch` (`components/ui/switch.tsx`) with visible label and `aria-describedby` → second sentence: on → `One email an hour at most, only for Approvals you can decide.`; off → `You'll still see them under Approvals. Nothing is emailed.`; a pending line while saving `Saving…` (`role=status`); on failure the switch reverts and `Couldn't save this. Check your connection and try again.` renders under it (`role=alert`), input state preserved (the toggle shows the value the user chose until reverted). Footer: `Done` only (the switch saves on change — the one autosave here, stated: a single boolean with immediate feedback, no draft state to lose; **not** the Admin save bar, which is for forms). Esc / Done close; focus returns to the account-menu trigger (the menu closed, so the opener is the trigger button — id `account-menu-trigger`).

Phone (`app/(app)/workspaces/[workspaceId]/account/page.tsx`): new `Panel` "Approval emails" with the same sentence + `Switch` + the same describedby sentences; same action; the same `Saving…`/error lines. 44px row.

Stop link — **GET never mutates** (mail scanners, Safe Links, unfurlers GET every URL in a mail; critic P1). `app/notices/stop/page.tsx` (public, no auth, minimal centred column on `bg-canvas`, one `<main>`):
- GET with a valid `t` → h1 `Stop approval emails?` body `You'll stop getting emails when an Approval needs you in ‹Workspace›. Approvals still wait for you in DocuBite.` one `<form method="POST" action="/notices/stop">` with hidden `t` and a 44px button `Stop these emails` (emerald, the page's only primary). One human click — still no login, Category 2 symmetry holds.
- `POST /notices/stop` (`app/notices/stop/route.ts`, verifies `t` again) → sets `approvalNoticeEmails=false`, then 303 → `/notices/stop?done=1&t=…` (re-verified; `done` without a valid token shows the invalid page): h1 `You'll stop getting approval emails.` body `Approvals still wait for you in DocuBite; nothing is emailed.` link `Turn them back on` → `/login?next=/workspaces/<ws>/account` (`ws` comes from the signed payload; sign-in required; lands on the Account page where the switch is).
- Already off (GET or POST) → h1 `Approval emails are already off.` same body + link.
- Invalid/expired token → 200 page (not a raw 4xx): h1 `This link isn't valid.` body `Open DocuBite and switch Approval emails off under Account.` link `Open DocuBite` → `/login`.
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click` points at the POST route (RFC 8058 clients POST); a test asserts a GET leaves the column unchanged.

Admin › Configuration (`admin/configuration/page.tsx`) when `!isEmailConfigured()`: one `ReadOnlyBand` sentence at the top: `Approval emails are off for this workspace: no sending address is configured. Approvers still see Approvals in DocuBite.` — visible text, not a tooltip.

## 5. State inventory (fortify) — every surface
| Surface | Empty | Loading | Error | Partial | Long content | Offline / denied |
|---|---|---|---|---|---|---|
| Sender | nothing new → no mail | n/a | Resend error → no stamp, retry next tick, `logger.warn` once | some rows Not eligible → excluded, others sent | n/a | email not configured → skipped + Admin band |
| Email | never sent empty | n/a | image-less by design (no broken img) | reached + nudge sections | supplier 80 chars, name 60 chars, reason 500 chars: all wrap; amount never wraps (`white-space:nowrap`) | plain-text part for text-only clients |
| Arrival | row decided → `decidedText` notice (existing) | page loading.tsx | not a member → existing denied page | — | — | signed out → login with `next` |
| Switch dialog / panel | — | `Saving…` status line, switch disabled while pending | inline alert, value reverts, focus stays on the switch | — | — | offline → `OFFLINE_REASON` sentence, switch disabled |
| Stop page | — | server-rendered | invalid token page (200); POST failure → same page with `Couldn't save this. Try the link again.` (`role=alert`) | already-off variant; GET = confirm page, POST = done page | — | public; no session needed |
| Admin band | not shown when configured | — | — | — | — | — |

## 6. Accessibility (include)
- Email: semantic `<h1>`, list as `<table role="presentation">` rows with the row link's accessible name = `‹Supplier›, ‹Invoice #›, ‹amount›, open in DocuBite` (`aria-label` — comma-separated, #257 lesson); button is an `<a>` with 44px min-height, `lang="en"` on `<html>`, `<title>` = subject; contrast: emerald button 4.6:1 on white, slate-500 on white 4.6:1+.
- Menu row: `role=menuitem`, arrow keys already handled by the menu; suffix folded into `aria-label`.
- Dialog: focus → `Switch`; Space toggles; Tab → Done; Esc closes; return to `#account-menu-trigger`. Pending/alert lines via `role=status` / `role=alert`, `aria-describedby` on the switch.
- Phone panel: `Switch` 44px target, label `<label htmlFor>`.
- Stop page: one `<main>`, `<h1>` first, the form button and the link ≥ 44px, button is a real `<button type=submit>`, no motion; works without JS (plain form POST).
- Reduced motion: no motion anywhere on these surfaces.

## 7. Tests
- `models/approval-notices.test.ts`: coalescing, floor, exclusions (starter, decided, removed, switch off), nudge cap 2, Not-eligible wait, failure → no stamp, not-configured skip.
- `lib/notices/stop-token.test.ts`: round-trip, tamper → invalid, expired (>90d) → invalid, webhook-signature of the same bytes → invalid (domain separation).
- `app/notices/stop`: GET leaves `approvalNoticeEmails` unchanged; POST flips it; POST with bad token → no write.
- `models/approval-notices.test.ts` also: reach → send back → restart → second `reached` notice; a task never in both sections; send-back mail does not stamp the floor; starter who left the workspace gets nothing.
- `proxy.test`/login: `next` accepted only for `/…` relative; `//evil` rejected.
- Email render snapshot per fixture (HTML + text).

## 8. Out of scope (ticket)
Push · tab-title counts / toasts (#246 Q15) · expense-claim sweep removal (#272) · expense claims as rows (#273: copy row is specced above so it needs no re-spec).

// One-shot: apply the Part D critic's required fixes to spec.md and preflight.md (#271).
import fs from "fs";
const dir = "docs/wayfinder-reports/226/logs/scratch-271/";
const p = dir + "spec.md";
let s = fs.readFileSync(p, "utf8");
const rep = (a, b) => { if (!s.includes(a)) throw new Error("miss: " + a.slice(0, 60)); s = s.replace(a, b); };

rep("- `ReviewTask.noticeCount Json?` → **no**: per-person nudge cap needs a per-(task, user) record. Add `ApprovalNotice { id, reviewTaskId, userId, workspaceId, kind: \"reached\"|\"nudge\"|\"sent_back\", sentAt, stageIndex }` (unique (reviewTaskId,userId,kind,stageIndex) not needed — count rows). Nudge cap: `count(kind=\"nudge\" AND reviewTaskId AND userId) < 2`.",
"- Per-(task, person) record `ApprovalNotice { id, reviewTaskId, userId, workspaceId, kind: \"reached\"|\"nudge\"|\"sent_back\", sentAt, stageIndex, stageReachedAt }` — `stageReachedAt` copies the task's value at send time, so a **restart after a send-back (new `stageReachedAt`, same stage index) counts as new again** (critic P1). Nudge cap: `count(kind=\"nudge\" AND reviewTaskId AND userId AND stageReachedAt = task.stageReachedAt) < 2` (cap is per stage visit).");
rep("the stop link is an HMAC over `userId` (`lib/webhook-signature.ts` `computeSignature`, secret `INTERNAL_WORKER_SECRET`), verified at `/notices/stop`.",
"the stop link token is `base64url(payload) + \".\" + HMAC-SHA256(\"approval-notice-stop:\" + payload)` with payload `userId:workspaceId:issuedAt` (purpose tag = domain separation from `lib/webhook-signature.ts`; same secret `INTERNAL_WORKER_SECRET`; constant-time compare; rejected when `issuedAt` is older than 90 days). Helper `lib/notices/stop-token.ts` `signStopToken` / `verifyStopToken`.");
rep("4. New for a person = tasks with `stageReachedAt > (last \"reached\" ApprovalNotice for this task+user+stageIndex)` i.e. no row yet for this (task, user, stageIndex, \"reached\").",
"4. New for a person = tasks with no `ApprovalNotice(kind=\"reached\")` row for (task, user) whose `stageReachedAt` equals the task's current `stageReachedAt`. A task is listed in **one** section only: if it qualifies as new it goes under New, never also under Still waiting (nudge eligibility starts from the `reached` row's `sentAt`).");
rep("8. Nudges (re-pointed `sendReviewTaskReminders`): a task still on the same stage for ≥ 48h since `stageReachedAt`, last nudge ≥ 72h ago (or none), `nudge` rows for (task,user) < 2",
"8. Nudges (re-pointed `sendReviewTaskReminders`): a task with a `reached` row for this person ≥ 48h old (same `stageReachedAt`), last nudge ≥ 72h ago (or none), `nudge` rows for (task, user, stageReachedAt) < 2");
rep("→ one email to `createdById` unless it is the actor or their switch is off. Obeys no floor (rare, requested by the run's own author's interest) — **exception stated**: the floor exists to stop per-invoice fan-out to approvers; a send-back is one mail per human decision.",
"→ one email to `createdById` unless it is the actor, their switch is off, or they are no longer a member of the workspace (same membership check as step 3). Obeys no floor and **does not stamp `noticeLastSentAt`** — exception stated: the floor exists to stop per-invoice fan-out to approvers; a send-back is one mail per human decision and must not delay the starter's next reached notice.");
rep("10. Kick: `startApprovalOnInvoice` / `startWorkflowOnReviewTask` and `decideReviewTaskStage` (when the stage advances) fire-and-forget POST the drain",
"10. Kick: `startApprovalOnInvoice` / `startWorkflowOnReviewTask`, `decideReviewTaskStage` (when the stage advances) and `sendReviewTaskBackForReview` (the returned stage's approvers) fire-and-forget POST the drain");
rep("So the notice lands within seconds, not at the next cron.",
"So the notice lands within seconds, not at the next cron. Cron cadence: cron-job.org drives the drain (`HANDOFF-DYNAMIC-DICTATION-AND-PROD-INFRA.md:133`); the interval is not recorded there — **assumption: ≤ 15 min**, so a person skipped by the floor waits at most floor + 15 min. Record the actual interval in the area primer at close.");
rep("accepted only when it starts with `/` and not `//` (same-origin relative, `parseInviteToken`-style validation)",
"accepted only when it matches `^\\/(?![\\/\\\\])` (relative, not protocol-relative, not backslash — browsers normalise `\\`→`/`) and does not start with `/login` (no loop); anything else is ignored and the default destination applies");
rep("Stop link `app/notices/stop/route.ts` (GET, public, no auth): verify `t` (HMAC of userId, constant-time compare). Valid → set `approvalNoticeEmails=false`, render `app/notices/stop/page` (server component, marketing shell not needed: minimal centred column on `bg-canvas`): h1 `You'll stop getting approval emails.` body `Approvals still wait for you in DocuBite; nothing is emailed.` link `Turn them back on` → `/login?next=/workspaces/<ws>/account` (sign-in required; the return path lands on the phone Account page where the switch is; on desktop that page also exists). Already off → same page, h1 `Approval emails are already off.`. Invalid/expired token → 200 page (not a raw 4xx text): h1 `This link isn't valid.` body `Open DocuBite and switch Approval emails off under Account.` link `Open DocuBite` → `/login`. No confirm step (one click, Category 2 symmetry: opting out is as easy as the default-on).",
`Stop link — **GET never mutates** (mail scanners, Safe Links, unfurlers GET every URL in a mail; critic P1). \`app/notices/stop/page.tsx\` (public, no auth, minimal centred column on \`bg-canvas\`, one \`<main>\`):
- GET with a valid \`t\` → h1 \`Stop approval emails?\` body \`You'll stop getting emails when an Approval needs you in ‹Workspace›. Approvals still wait for you in DocuBite.\` one \`<form method="POST" action="/notices/stop">\` with hidden \`t\` and a 44px button \`Stop these emails\` (emerald, the page's only primary). One human click — still no login, Category 2 symmetry holds.
- \`POST /notices/stop\` (\`app/notices/stop/route.ts\`, verifies \`t\` again) → sets \`approvalNoticeEmails=false\`, then 303 → \`/notices/stop?done=1&t=…\` (re-verified; \`done\` without a valid token shows the invalid page): h1 \`You'll stop getting approval emails.\` body \`Approvals still wait for you in DocuBite; nothing is emailed.\` link \`Turn them back on\` → \`/login?next=/workspaces/<ws>/account\` (\`ws\` comes from the signed payload; sign-in required; lands on the Account page where the switch is).
- Already off (GET or POST) → h1 \`Approval emails are already off.\` same body + link.
- Invalid/expired token → 200 page (not a raw 4xx): h1 \`This link isn't valid.\` body \`Open DocuBite and switch Approval emails off under Account.\` link \`Open DocuBite\` → \`/login\`.
- \`List-Unsubscribe-Post: List-Unsubscribe=One-Click\` points at the POST route (RFC 8058 clients POST); a test asserts a GET leaves the column unchanged.`);
rep("\"List-Unsubscribe\": \"<stop url>\"", "\"List-Unsubscribe\": \"<POST /notices/stop?t=…>\"");
rep("- `lib/notices/stop-token.test.ts`: HMAC round-trip, tamper → invalid.",
`- \`lib/notices/stop-token.test.ts\`: round-trip, tamper → invalid, expired (>90d) → invalid, webhook-signature of the same bytes → invalid (domain separation).
- \`app/notices/stop\`: GET leaves \`approvalNoticeEmails\` unchanged; POST flips it; POST with bad token → no write.
- \`models/approval-notices.test.ts\` also: reach → send back → restart → second \`reached\` notice; a task never in both sections; send-back mail does not stamp the floor; starter who left the workspace gets nothing.`);
rep("| Stop page | — | server-rendered | invalid token page (200) | already-off variant | — | public; no session needed |",
"| Stop page | — | server-rendered | invalid token page (200); POST failure → same page with `Couldn't save this. Try the link again.` (`role=alert`) | already-off variant; GET = confirm page, POST = done page | — | public; no session needed |");
rep("- Stop page: one `<main>`, `<h1>` first, link ≥ 44px, no motion.",
"- Stop page: one `<main>`, `<h1>` first, the form button and the link ≥ 44px, button is a real `<button type=submit>`, no motion; works without JS (plain form POST).");
fs.writeFileSync(p, s);

const q = dir + "preflight.md";
let t = fs.readFileSync(q, "utf8");
const rp = (a, b) => { if (!t.includes(a)) throw new Error("miss: " + a.slice(0, 60)); t = t.replace(a, b); };
rp("| Stop these emails (mail footer) | `<a>` → `/notices/stop?t=` | no (reversible) | landing page states the state + \"Turn them back on\" link | switch on again after sign-in |",
"| Stop these emails (mail footer) | `<a>` → GET `/notices/stop?t=` confirm page → `<form POST>` button `Stop these emails` | no (reversible) | confirm page states what stops; done page states the state + \"Turn them back on\" link; **GET never writes** | switch on again after sign-in |");
rp("| stop link | landing page text; menu suffix next load | server write before render | yes |",
"| stop link (POST) | done page text; menu suffix + dialog switch on next server render | server write before render; the dialog reads the value via a server action on open, not a cached prop; suffix via `router.refresh()` when the menu opens | yes |\n| send back for review | starter's mail; returned-stage approvers' mail | drain kick from `sendReviewTaskBackForReview` | ≤ 5s |");
rp("| Floor | cron and kick tick overlap | member row locked in the send transaction; notice rows written with the stamp |",
"| Floor | cron and kick tick overlap | member row locked in the send transaction; notice rows written with the stamp |\n| Restart after send-back | same stage index reached again | keyed on `stageReachedAt`, so it is new again; nudge cap resets per stage visit |\n| Stop token | forwarded mail, scanner GET, replay months later | GET is read-only; token scoped by purpose tag + ws + issuedAt ≤ 90d |");
rp("| Stop page | ok / already off / invalid | h1 states result | link back | none needed | one link, named | invalid page explains |",
"| Stop page | confirm (GET) / done (POST) / already off / invalid / POST failure | h1 states result | link back | GET read-only; single explicit button | one button + one link, named | invalid page explains; POST failure alert |");
rp("## Part D — Spec critic\n(filled after the run — see § D-result below)",
`## Part D — Spec critic (opus, fresh context, spec + this file + template + glossary)
| H | critique: self / critic / reconciled | evaluate: self / critic / reconciled | Spec change made |
|---|---|---|---|
| H1 | 4 / 3 / 4 | 1 / 3 / 1 | \`ApprovalNotice.stageReachedAt\`; restart after send-back re-notifies; dialog reads value on open |
| H2 | 3 / 3 / 3 | 0 / 1 / 1 | — |
| H3 | 3 / 3 / 3 | 1 / 3 / 1 | stop link: GET confirm page + POST write (scanners never switch anyone off); List-Unsubscribe-Post → POST route |
| H4 | 3 / 3 / 3 | 1 / 1 / 1 | route.ts (POST) + page.tsx (GET) split stated |
| H5 | 4 / 3 / 4 | 0 / 2 / 0 | token = purpose tag + userId:ws:issuedAt, 90-day expiry, domain-separated from webhook sigs; \`next\` regex rejects \`//\`, \`/\\\\\`, \`/login\` |
| H6 | 3 / 3 / 3 | 1 / 1 / 1 | \`ws\` for "Turn them back on" comes from the signed payload |
| H7 | 3 / 3 / 3 | 0 / 2 / 1 | send-back kicks the drain; send-back does not stamp the floor; cron cadence assumption stated (≤ 15 min) |
| H8 | 3 / 3 / 3 | 1 / 2 / 1 | a task appears in one section only (New wins) |
| H9 | 3 / 3 / 3 | 0 / 1 / 0 | membership check on the send-back recipient |
| H10 | 3 / 3 / 3 | 0 / 1 / 1 | — |
Critic before fixes: 30/40, sum 17, health ≈ 70, verdict Clean conditional on the GET fix. Reconciled after the fixes (the critic's own "after" line): H1 4, H5 4, rest 3 → **32/40**, sum ≈ **8**, P0 0, P1 0, health ≈ 85, **Clean**. Gate met.`);
fs.writeFileSync(q, t);
console.log("ok");

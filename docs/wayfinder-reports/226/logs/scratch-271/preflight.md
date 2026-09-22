# Pre-flight — #271 Approval notice (filled; template: scripts/wayfinder-autopilot/preflight.md)

Surfaces: (a) the email (600/390), (b) Approval-emails switch — desktop dialog + phone panel, (c) stop-link landing, (d) Admin band, (e) queue arrival via notice. Mode: Operate on all.

## Part A — Two excellence targets
| H | Target | What a 4 looks like here | Spec |
|---|---|---|---|
| H1 Status | 4 | Every mutation confirms in the same tick: switch → `Saving…` status → suffix `Off` on the menu row + panel state + email footer sentence all read from the one `User` column; stop link → landing page states the new state ("You'll stop…" / "already off"); email itself is status (what waits, since when, "waiting d days"); arrival → row opened or `decidedText` notice. | spec §3.6, §4, §5 |
| H5 Prevention | 4 | No decision is possible from the mail (button opens, never approves — the one destructive-by-forward risk removed); the floor and nudge cap are structural so over-mailing cannot happen; switch off is one click and reversible; `next` param validated; stop token HMAC; invalid link lands on an explanatory page, never a raw error. | spec §1.5–8, §2, §4 |
| H2–H4, H6–H10 | 3 | glossary terms only (Approval, Approver, Ready to Approve, Approval emails); shell `Dialog`/`Switch`/`Panel`/`ReadOnlyBand`; visible reasons everywhere; one-tap deep link; no repeated data; errors at the control; the rule taught where it bites (dialog describedby, footer sentence, Admin band). | — |

## Part B — Contracts
### B1 · Action reachability and reversal
| Action | Control | Destructive? | Consequence copy | Reversal |
|---|---|---|---|---|
| Open row from mail | `<a>` row link + `Open in DocuBite` button | no | — | back to list (existing origin strip) |
| Switch Approval emails off/on | `Switch` in dialog (desktop) / panel (phone), `setApprovalNoticeEmailsAction` | no | describedby sentence states what changes | flip the switch |
| Stop these emails (mail footer) | `<a>` → GET `/notices/stop?t=` confirm page → `<form POST>` button `Stop these emails` | no (reversible) | confirm page states what stops; done page states the state + "Turn them back on" link; **GET never writes** | switch on again after sign-in |
| Kick drain | fire-and-forget in `startApprovalOnInvoice`/`startWorkflowOnReviewTask`/`decideReviewTaskStage`/`sendReviewTaskBackForReview` | no | — | n/a |
Check: `grep -rn setApprovalNoticeEmailsAction components app` ≥ 2 callers; `grep -rn "notices/stop" components/emails` ≥ 1; `grep -rn "window.confirm\|alert(" <new files>` empty; no string "Approve" in `components/emails/approval-notice-email.tsx` except inside "approval"/"approvals".

### B2 · View freshness
| Mutation | Views | Mechanism | Same tick |
|---|---|---|---|
| switch change | dialog switch + status line · menu-row `Off` suffix · phone panel · (next email footer) | optimistic switch state + server action + `router.refresh()` for the suffix; account page `revalidatePath` | yes (suffix reads the same prop the dialog wrote) |
| stop link (POST) | done page text; menu suffix + dialog switch on next server render | server write before render; the dialog reads the value via a server action on open, not a cached prop; suffix via `router.refresh()` when the menu opens | yes |
| send back for review | starter's mail; returned-stage approvers' mail | drain kick from `sendReviewTaskBackForReview` | ≤ 5s |
| stage reached | mail sent next tick (kicked → seconds); Approvals badge already live | drain kick | ≤ 5s |
| decided before arrival | `decidedText` notice on arrival | existing `queueArrival` | yes |

### B3 · Vocabulary
| Concept | Term | Appears on | Casing |
|---|---|---|---|
| the feature | Approval notice (glossary; internal) / **Approval emails** (user-facing control name) | menu row, dialog title, phone panel, footer 3rd line, Admin band | sentence |
| the row | Approval / invoice (`n invoices need…`), claim (`expense claim`) | subject, heading, lead | sentence |
| the destination | Ready to Approve (phone h1, existing) / `Open in DocuBite` (button) | button, plain-text | as existing |
| opt-out | Stop these emails | footer link only; stop page uses "approval emails" | sentence |
| nudge | Still waiting | subject prefix, section heading, row suffix `waiting d days` | sentence |
Check: extract strings from the new files; "Reminder"/"digest"/"alert"/"notification" must not appear user-facing (CONTEXT avoid list).

### B4 · Primitive reuse
| Need | Shell primitive | New? |
|---|---|---|
| dialog | `components/ui/dialog.tsx` | no |
| toggle | `components/ui/switch.tsx` | no |
| phone panel | `Panel` (`components/automation/automation-ui.tsx`) | no |
| Admin sentence | `ReadOnlyBand` | no |
| menu row | existing `itemClass` button pattern in `account-menu.tsx` (mirror Keyboard shortcuts row) | no |
| email layout | `components/emails/email-layout.tsx` (+ `align` prop for left h1) | extend, not fork |
| stop landing | plain server page on `bg-canvas`, shell typography tokens | new page, no new primitive |
Check: `git diff --name-only` shows no new file under `components/ui`.

### B5 · Focus, keys, failure path
| Surface | Initial focus | Trap/Esc/return | Keys | Failure |
|---|---|---|---|---|
| Approval-emails dialog | `Switch` (`initialFocus`) | Dialog trap; Esc + Done close; return `#account-menu-trigger` (menu already closed; trigger never disabled) | Space toggles, Tab → Done | 4xx/5xx/network → `role=alert` sentence under the switch, value reverts, focus stays on switch |
| Phone panel switch | n/a (in page) | — | Space | same alert line; offline → disabled + `OFFLINE_REASON` |
| Mail links | — | — | — | signed out → login?next; decided → `decidedText`; not member → denied page |
| Stop link | page `<h1>` first | — | — | invalid token → 200 explanatory page |
| Login `next` | existing | — | — | invalid `next` → ignored, default destination |
Probe: keyboard.json entries `switch-dialog-open-focus-{1440}`, `switch-dialog-esc-return-{1440}`, `account-panel-switch-{390}`.

### B6 · Time-axis
| Entity | Can change | Then |
|---|---|---|
| ReviewTask | decided / cancelled / stage reassigned between reach and tick | re-read at tick; excluded |
| Approver | removed from workspace or stage between reach and tick or before opening | excluded at tick; on arrival existing not-eligible/denied handling |
| Row | decided by someone else before the link is opened | `decidedText` notice |
| Floor | cron and kick tick overlap | member row locked in the send transaction; notice rows written with the stamp |
| Restart after send-back | same stage index reached again | keyed on `stageReachedAt`, so it is new again; nudge cap resets per stage visit |
| Stop token | forwarded mail, scanner GET, replay months later | GET is read-only; token scoped by purpose tag + ws + issuedAt ≤ 90d |
| Email config | unconfigured at tick, configured later | nothing lost: `stageReachedAt` still qualifies until a `reached` row exists (bounded by the task still being open) |
| Switch | turned off after a mail was queued | Resend send is synchronous; no queue |

## Part C — Coverage by type
| Type | States | H1 | H3 | H5 | H6 | H9 |
|---|---|---|---|---|---|---|
| Email | single/plural/nudge/mixed/sent-back/long/claim; text part | heading + lead + dates | stop link, account sentence | no decide control | labels on every fact (started by, waiting d days) | n/a (no input) |
| Menu row | on/off suffix | suffix | Esc | — | icon + label | — |
| Dialog | idle/saving/error/offline | status line | Done/Esc/return | switch disabled while saving | describedby sentences | alert at control |
| Phone panel | idle/saving/error/offline | same | — | same | label + sentence | same |
| Stop page | confirm (GET) / done (POST) / already off / invalid / POST failure | h1 states result | link back | GET read-only; single explicit button | one button + one link, named | invalid page explains; POST failure alert |
| Admin band | shown only when unconfigured | sentence | — | — | — | — |
| Arrival | row / decided / signed-out / denied | notice | back link | — | — | existing |

## Part D — Spec critic (opus, fresh context, spec + this file + template + glossary)
| H | critique: self / critic / reconciled | evaluate: self / critic / reconciled | Spec change made |
|---|---|---|---|
| H1 | 4 / 3 / 4 | 1 / 3 / 1 | `ApprovalNotice.stageReachedAt`; restart after send-back re-notifies; dialog reads value on open |
| H2 | 3 / 3 / 3 | 0 / 1 / 1 | — |
| H3 | 3 / 3 / 3 | 1 / 3 / 1 | stop link: GET confirm page + POST write (scanners never switch anyone off); List-Unsubscribe-Post → POST route |
| H4 | 3 / 3 / 3 | 1 / 1 / 1 | route.ts (POST) + page.tsx (GET) split stated |
| H5 | 4 / 3 / 4 | 0 / 2 / 0 | token = purpose tag + userId:ws:issuedAt, 90-day expiry, domain-separated from webhook sigs; `next` regex rejects `//`, `/\\`, `/login` |
| H6 | 3 / 3 / 3 | 1 / 1 / 1 | `ws` for "Turn them back on" comes from the signed payload |
| H7 | 3 / 3 / 3 | 0 / 2 / 1 | send-back kicks the drain; send-back does not stamp the floor; cron cadence assumption stated (≤ 15 min) |
| H8 | 3 / 3 / 3 | 1 / 2 / 1 | a task appears in one section only (New wins) |
| H9 | 3 / 3 / 3 | 0 / 1 / 0 | membership check on the send-back recipient |
| H10 | 3 / 3 / 3 | 0 / 1 / 1 | — |
Critic before fixes: 30/40, sum 17, health ≈ 70, verdict Clean conditional on the GET fix. Reconciled after the fixes (the critic's own "after" line): H1 4, H5 4, rest 3 → **32/40**, sum ≈ **8**, P0 0, P1 0, health ≈ 85, **Clean**. Gate met.

## Part E — Predict evaluate
### E1
| H | Worst issue still permitted | Sev | Fix |
|---|---|---|---|
| H1 | menu-row suffix could lag if refresh omitted | 1 | B2 row: refresh + same prop |
| H2 | "invoices" subject when the mix has a claim — handled (`approvals`) | 0 | §3 |
| H3 | account menu not URL-addressable from mail (footer says "under Account") — phone page linked | 1 | §3.6 |
| H4 | `email-layout` centred h2 vs left h1 — extend with prop | 1 | B4 |
| H5 | none (no decide from mail; token HMAC) | 0 | |
| H6 | date without time may look stale — date is enough for days-level nudges | 1 | |
| H7 | one tap to row; no bulk from mail by design | 0 | |
| H8 | footer three lines | 1 | |
| H9 | switch save failure sentence at control | 0 | |
| H10 | rule taught in describedby + footer | 0 | |
Sum 5 · P0 0 · P1 0 · P2 0.

### E2 Walkthroughs
| Task | Step | try | notice | associate | progress | Rating |
|---|---|---|---|---|---|---|
| Approver opens the waiting row | read subject → open mail → tap supplier/button → (sign in) → row | y | y (button 44px, first link) | y ("Open in DocuBite") | y (row opens / decided notice) | pass |
| Approver stops the mail | footer link → landing | y | y (13px underlined, ≥4.5:1) | y | y (h1 states it) | pass |
| Approver turns it back on | landing link → login → Account page → switch | y | y | y | y (Saving… → state) | pass, 1 hesitation (sign-in) |
| Starter reads a send-back | subject → reason block → open row | y | y | y | y | pass |
| Admin learns email is off | Admin › Configuration band | y | y | y | — | pass |
Estimate: completion 95% · steps ≤ 4 · error point: sign-in on a phone.

### E3 Anti-patterns
Pre-selection: default-on is a work notification for a role the person holds, with one-click off and the reason stated in every mail — not marketing consent; documented. Hidden cost: none. Guilt copy: none (footer factual). Buried exit: footer link in every mail + List-Unsubscribe header. Forced continuity: none. Asymmetric friction: off = 1 click, on = sign-in + switch (stated; on requires identity). Misleading label: button says Open, not Approve. Verdict: Clean.

## Part G — Predicted vs measured
(filled at close)

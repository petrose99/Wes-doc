# Area primer — Admin

Shipped by #252 (shell + Configuration) and #253 (Approval Flows, PO Mismatch Flows); Companies/Users org-level shells are #285/#286, Admin dashboard #287. Mode: Operate. Decisions live on #231 and #226; do not re-decide here.

## Routes
`app/(app)/workspaces/[workspaceId]/admin/` — `page.tsx` (lands on Configuration › Fields), `configuration/{page,autonomy,checks,intake,payments,report,tax,whats-on}`, `approval-flows`, `po-mismatch-flows`, `suppliers`, `users`, `companies`, `integrations`; `admin/layout.tsx` owns the nav and the company caption; `admin/loading.tsx` is the loading frame. Account is `account/{page,security}` with its own `loading.tsx`. Paths come from `lib/admin/paths.ts` (`adminPaths(workspaceId)`, `accountPaths`, `legacyAdminTarget` for old Settings URLs). `getAdminContext` (cached) gives role and company.

## Primitives — use these, never a bespoke one beside them (pre-flight B4)
- `components/admin/admin-ui.tsx`: `AdminPage` (title, intro sentence, optional `company` caption below `md`), `AdminNav`, `PhoneNote` ("Admin is a desktop area…"), `ReadOnlyBand` ("Ask an owner: <name>" for non-owners — the page renders, never a 404), `Consequence` (the sentence under a toggle that says what changes), `ModuleOff`, `Card*`.
- `components/admin/admin-save-bar.tsx` `AdminSaveBar`: the one save grammar. Every form is explicit-save on the sticky bar with Saved / Unsaved / Saving… + `aria-live`, Discard, Ctrl+S. No autosave, no inline Save buttons (that was #252's P1).
- `components/admin/admin-leave-guard.tsx` + `lib/client/unsaved-changes.ts` (`setUnsaved`): every form registers, the guard is the shared `ConfirmDialog` (never `window.confirm`), fires on nav click and Back.
- `components/ui/confirm-dialog.tsx` `ConfirmDialog`: consequence-first confirm for ⚠ actions (deactivating the default flow, delete). Its footer has no fill (a fill reads as `nested-cards`).
- Forms that exist: `FieldTableEditor` (per-field Editable/Required/Width, lock reason visible via `title` + footnote, not sr-only), `TaxForm`, `CompanyNameForm`, `DocTypeSwitcher`, `components/workspace/approval-flows-editor.tsx` (list + editor), `approval-workflow-row.tsx` (status Pill, explicit Activate/Deactivate, Duplicate, Delete), `default-approval-flow.tsx` (confirm shows the 30-day auto-start estimate), `po-mismatch-policy.tsx` (tolerances + who approves, one save).
- Client components must not import from `models/*` (Prisma → `pg` → `dns` breaks the browser bundle; #253). Shared constants go in `lib/**` (e.g. `lib/approvals/default-flow.ts`).

## Data and actions
Server actions in `app/(app)/workspaces/[workspaceId]/actions.ts` (owner-only via `requireMember(…, ["owner"])`, refusals name who can); `models/approval-defaults.ts`, `models/mismatch-approvers.ts`, `models/approval-workflows.ts`; `overrideGate` refuses non-approvers on match-variance gates. Automation config: `models/automation-config.ts` (`matchTolerance.percent` stored 0–1, entered 0–100).

## Seed, dev server, capture
- Dev workspace `af91555d-7450-4b21-a8ac-73db092617c8`, `DEV_AUTH_BYPASS=true` in `.env`, devdb container `docubite-devdb` on `127.0.0.1:55433` (`docker start` after a reboot).
- Seed: `npx tsx --env-file .env scripts/dev/db253.ts <cmd>` (flows, default flow, approvers, inactive default), `scripts/dev/seed-*.ts` for queues.
- Dev server / engine wrappers (the `impeccable` launcher is denied under the driver): `node .impeccable/live/dev.mjs start|stop|status|log`, `node .impeccable/live/imp.mjs live-server --background`. Stop the dev server before `tsc`, `eslint`, the full suite or `next build` — the box cannot run them beside it.
- Capture runner: `.impeccable/live/admin253.mjs` (copy to `/tmp/scratch229/` — it resolves Playwright from its own folder; `cp`/`cd` there are blocked, use `node -e "fs.copyFileSync(...)"`) — every state × 1440/390, detector JSON per state, keyboard probes. Then one contact sheet: `node /tmp/scratch229/contact-sheet.mjs <shots-dir> --out sheet.png`.
- Chained shell (`&&`, `;`, `$(…)`) is blocked for sub-agents: multi-step work goes in a `.mjs`/`.py` file.

## Detector residue (report, do not chase)
App-wide on every state: workspace-switcher avatar palette ×2, Inter as `overused-font`, dev overlay `layout-transition` + `dark-glow` on `body` — five per state. Admin adds `text-overflow` on the expanded rail's truncated workspace name (shell, 1440) and, with the account menu open, `text-occlusion` on rail labels under the popover. With the switcher popover open over a queue page at 1440, the underlying queue shell's own heading sizes (`h1#queue-title` `components/queue/queue-screen.tsx:489` at `text-lg`, `h2` `components/queue/detail-pane.tsx:99` at `text-sm`) trip `flat-type-hierarchy` — pre-existing app-wide scale on the queue shell, not introduced by the switcher/dashboard/picker (#287); a fix belongs to a queue-shell typography ticket, not here.

As regexes, for `gate.mjs --residue-file docs/agents/areas/admin.md` and the round script's `residue` option (matched against `<type> <selector> <detail>`):

```residue
ai-color-palette.*Cyan gradient background
overused-font
layout-transition.*transition: height
dark-glow.*#ffba00
text-overflow.*(workspace|rail)
text-occlusion.*rail
flat-type-hierarchy.*h2 14px, body 16px, h1 18px
```

## Companies (#285)
`app/(app)/workspaces/[workspaceId]/admin/companies/{page,actions}.ts` + `[companyId]/page.tsx` (deep link; exports `CompaniesScreen({params, selectedId})`, the default just calls it). `components/admin/companies-queue.tsx` (`QueueScreen<CompanyRow>`, three page states: personal / ungrouped-owner / organization), `company-detail.tsx` (pane), `company-danger-actions.tsx` (card-less Delete/Leave, refactored from `components/workspace/danger-zone.tsx`). `lib/admin/companies.ts` is the client-safe row/error-code layer (`CompanyRow`, `companyActionErrorText`). `models/organizations.ts` gained `removeWorkspaceFromOrganization`, `listOwnedUngroupedTeamWorkspaces`, `_count.members`. `/workspaces` and `/workspaces/[id]` forward `?notice=&name=` to their redirect targets; `components/shell/notice-toast.tsx` (mounted in `app/(app)/layout.tsx` inside `Suspense`) consumes and strips it — the pattern for any hard-navigation success toast that can't survive its own reload.
Seed states (`prisma/seed.ts` `seedDevBypassOrganization`, per-item idempotent): owner pane with a movable/non-owner mix = Riverside Bakery Co. `9cdcdf3f-9608-47a1-8495-abb1e210871c` (org Acme Advisory: Riverside · Harbor Lights Cafe `a74a45c2-…` owner · Northwind Traders `c5315ed3-…` member-only, owner is Prisma-only "Priya Naidoo"); ungrouped-owner state = Pine Street Consulting `60a2b427-…`; personal state = Dev User's workspace `af91555d-…`.
QueueScreen's pane ⋯ always renders a built-in "Open in a new tab" item (`fullHref`, defaults to `basePath/id?full=1`) alongside any `paneMenu` items — every queue has it. A spec that names an exact non-owner menu ("Open Admin only") is describing the *added* items, not the shell default; don't read its absence from the spec as a bug.

## Users (#286)
`admin/users/{page,actions}.ts` + `[userKey]/page.tsx` (keys `u:<userId>` / `inv:<invitationId>`; a miss renders the list with a nameless notice). `components/admin/users-queue.tsx` (`QueueScreen` with `primaryAction` Invite (`hidden md:inline-flex`), `search` `#queue-search`, facets role/status; personal mode is a one-row queue), `user-detail.tsx` (pane: `PaneHeader` Pills You/Invited/Expired/‹Role›; `InvitedBody` Resend/Revoke/Copy link; `MemberBody` tabs Information · Companies, bank fieldset, per-company `NativeSelect` role + `Consequence`, ✕ Remove/Leave via `useAsyncConfirm` in `user-confirm.tsx` with an 8 s Undo toast, `AdminSaveBar inPane saveButtonId="user-pane-save"`), `usePhoneLane()` = read-only below `lg`. `lib/admin/users.ts` is the client-safe layer (`ROLE_LABELS`, `filterUserRows`, `actionErrorText` — codes may carry `:<company>` and, for `member_already_exists`, a trailing `:<userId>` the Invite dialog links "Open their row" to). `models/admin-users.ts` (`loadUsersPage`, `loadUserRow`; `bank` serialised only for an owner of the current company or the viewer; `ownerNames()` never lists the viewer). Every mutation in `actions.ts` is owner-gated server-side (`owner_required`).
Gating grammar: the role select and Remove need `section.viewerOwns`; **Leave (✕ on the own row) needs no ownership**, only the personal-workspace exclusion. The bank "Ask an owner: ‹names›" line renders only for a true non-owner; an owner on the phone lane gets the pane's `PhoneNote` instead.
Seed: Riverside (org owner, 6 rows), Northwind `c5315ed3-…` (viewer is Member), Pine `60a2b427-…` (team, ungrouped), personal `af91555d-…` (must hold exactly its owner — `scripts/dev/db253.ts` once planted two extra members there; `logs/scratch-286/check-personal.mts` verifies). Round script: `docs/wayfinder-reports/226/logs/scratch-286/round-286.mjs` via `run-round.mjs <rN> [only]`; `servers.mjs up|down`. If `next dev` idles at `Compiling /` for minutes, clear `.next/dev/cache/turbopack` + `.next/dev/lock` and restart.
Known shell gap (#327): Escape and the pane ✕ close an editable pane without an unsaved-changes confirm (`queue-screen.tsx` ~415); `AdminLeaveGuard` only covers links and Back.

## Conventions the bar checks
Vocabulary: "company" in Admin copy (not "workspace"); one term per concept, one casing. Keys: Tab order reaches the save bar, Escape closes menus and returns focus, Ctrl+S saves, tablists use arrow keys. States per form: loading frame, empty ("Add a …" with the consequence), error with the values kept ("Couldn't save — … Your changes are still here." with Reload on stale), read-only band for members. Below `md`: `PhoneNote` + company caption from the layout, tables scroll horizontally with the header not clipping.

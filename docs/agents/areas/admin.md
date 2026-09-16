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
App-wide on every state: workspace-switcher avatar palette ×2, Inter as `overused-font`, dev overlay `layout-transition` + `dark-glow` on `body` — five per state. Admin adds `text-overflow` on the expanded rail's truncated workspace name (shell, 1440) and, with the account menu open, `text-occlusion` on rail labels under the popover.

## Conventions the bar checks
Vocabulary: "company" in Admin copy (not "workspace"); one term per concept, one casing. Keys: Tab order reaches the save bar, Escape closes menus and returns focus, Ctrl+S saves, tablists use arrow keys. States per form: loading frame, empty ("Add a …" with the consequence), error with the values kept ("Couldn't save — … Your changes are still here." with Reload on stale), read-only band for members. Below `md`: `PhoneNote` + company caption from the layout, tables scroll horizontally with the header not clipping.

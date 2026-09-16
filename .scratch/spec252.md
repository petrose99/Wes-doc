# #252 — Admin area shell + Configuration — pre-build spec

Owner: autopilot on behalf of petrose99 · 2026-09-16 · Status: ready to build.
Decided on #231 (decisions 9–13, 20–27) and ADR 0002; nothing here re-decides them.
Mode: **Operate**. Users: the workspace owner (Priya-type accountant across companies, Alex the finance lead) doing rare, consequential configuration; members read.

## Context (intent)
- Problem: Settings (shadcn cards, 11 tabs) and Controls (Panel/Ledger) are two admin trees with two "Settings" and two "Rules" (critique 23/40, H4 = 1, H7 = 1, H8 = 2). The owner cannot say what a field does to the pane or the queue anywhere.
- Ethical stance: no autosave of policy (an owner never has a half-typed rule in force); read-only for members with a named recovery ("Ask an owner"), never `notFound()`; nothing removed without sign-off (#256 pending — Templates and Reports stay reachable).
- Success (#231 Q27): settings destinations 15 → 8; critique ≥ 34, evaluate ≥ 90; zero page-specific detector findings.

## IA (organize) — one rail item "Admin", left nav inside the work area
```
ORGANIZATION        Companies · Users            (Dashboard only at ≥2 companies → never on this branch, so not rendered)
‹COMPANY NAME›      Configuration · Approval Flows · PO Mismatch Flows · Suppliers · Integrations (absent when integrations off)
```
Configuration is one destination with in-page sections routed as sub-pages (distill: ≤4 groups per screen):
`/admin/configuration` **Fields** · `/autonomy` **Autonomy** · `/checks` **Checks** (warn checks) · `/intake` **Intake** (AI extraction + email intake) · `/tax` **Tax** · `/payments` **Payments** (payer accounts) · `/whats-on` **What's on** (Modules; Templates + Reports as the last two sections until #256 is signed).
Left nav shows the seven sub-links under Configuration while any is active.

Routes and redirects (308, `permanentRedirect`):
- `/settings/workspace` → `/admin/users` · `/settings/modules` → `/admin/configuration/whats-on` · `/settings/rules` → `/admin/suppliers` · `/settings/tax` → `/admin/configuration/tax` · `/settings/email` → `/admin/configuration/intake` · `/settings/payments` → `/admin/configuration/payments` · `/settings/templates|reports` → `/admin/configuration/whats-on` · `/settings/integrations|accounting-mapping` → `/admin/integrations` · `/settings/security` → `/account/security` · `/settings/categories` → `/admin/configuration/tax`
- `/automation` → `/admin/configuration/autonomy` · `/automation/settings` → same · `/automation/warn-checks` → `/admin/configuration/checks` · `/automation/vendors` → `/admin/suppliers` · `/automation/approvals` → `/admin/approval-flows` · `/automation/matches` → `/admin/po-mismatch-flows`
- Rail: bottom group Activity · Health Checks · **Admin**; Settings and Controls entries go. Rail collapses to the 56px icon rail on `/admin/*` (QUEUE_SEGMENTS gains "admin").
- Account menu: **Security** (→ `/account/security`) · **How DocuBite works** is #241/#263's — here: **Reset tour** (moved from Settings › Workspace) · Sign out.
- Phone tab 4: **Account** → `/account` (name, email, Security, Switch company list, Reset tour, Sign out).

## Screens

### A. Admin shell (`admin/layout.tsx`)
Intent: one place, one grammar; the owner always knows which company they are configuring (Priya's six clients).
- `<div class="flex">` · `<nav aria-label="Admin">` 208px, sticky top, two groups with captions (11px uppercase tracking, slate-500) ORGANIZATION / ‹company name, truncated, title=full›; links 32px tall, `aria-current="page"`, active = emerald-800 text + 3px emerald bar (same as rail). Configuration's sub-links indent 12px, 28px tall.
- `<main>` `max-w-[880px]` px-8 py-8; h1 `font-display text-[26px]` = section name; one-line intro (slate-600, ≤68ch).
- Below `md`: nav becomes a horizontal chip row? **No** — decision 18: Admin is desktop-only. Below `md` the page renders content-only under a one-line note `Admin is a desktop area — open it on a computer to make changes.` (slate-600, top of main), nav hidden, controls disabled. Deep links still resolve.
- Tokens: `--hairline` (#e6ebf1), `--hairline-soft` (#f1f5f9), `--hairline-dashed` (#dbe3ec) in globals.css + tailwind `border-hairline`, `divide-hairline-soft`, `border-hairline-dashed`; Panel/Ledger/Sheet/Empty/AmountBandRow/config form switch to them (extract).
- Save bar (`AdminSaveBar`): sticky bottom of `<main>`, white, `border-t border-hairline`, 56px: **Save changes** (primary) · **Discard** (ghost) · "Unsaved changes" amber dot text; hidden until dirty; `beforeunload` while dirty; status line after save "Saved · just now" (aria-live=polite). Save failed: inline red sentence beside the buttons, form preserved.

### B. Configuration › Fields (`/admin/configuration`)
Intent (decision 11): the one table that decides what the Detail pane shows/edits/requires and which columns each queue's system views show by default. Owner-only edit.
- Doc-type switcher above the table: segmented control Invoice · Purchase Order · Receipt · Bank Statement (`role=tablist`, arrow keys, `aria-selected`); URL `?type=` so it deep-links.
- Consequence sentence under the h1: "Each row is one field on the ‹Invoice› Detail pane. Editable lets a reviewer change it; Required holds the document in review until it has a value; Width sets the column in the ‹Invoices› queue's system views (a saved view keeps its own columns)."
- Real `<table>` (`<caption class=sr-only>`): columns **Field** (label + key in 12px mono slate-500), **Editable** (checkbox, aria-label="‹label› editable"), **Required** (checkbox), **Width** (`<select>` Hidden · Narrow · Normal · Wide; Hidden = not a default column), **Order** (↑ ↓ buttons, 32px, aria-label "Move ‹label› up"), ✕ **Remove** only on custom rows (aria-label "Remove custom field ‹label›", confirm inline: "Remove ‹label› from every ‹type›'s pane? Values already extracted stay in the documents." Remove / Keep).
- Rows 40px, `divide-hairline-soft`, header 13px slate-500. Canonical rows come from `DOC_TYPE_SPECS[type].canonicalKeys`; custom rows from that type's `DocumentTemplate` custom fields (non-system templates, keys not in canonical). Custom rows show a "Custom" pill (slate-100/slate-700, ≥4.5:1).
- Rows that cannot be non-editable/non-required: the counterparty, number, date, total, currency fields that checks read (`checkFields`) → Required locked on with a lock glyph + title/sr text "Checks need this field". Not editable is allowed.
- Add custom field: **Add a field** button opens an inline row (label, key auto-slug, type select string/number/boolean) — writes via existing template versioning? **Out of scope for this ticket**: custom fields are created in Templates until #256 decides its fate; the table lists and configures them. Button omitted; the intro's last sentence says "Custom fields come from your document templates."
- States: default · **loading** (server-rendered, none) · **no custom fields** (only canonical rows, no empty state needed) · **member** (checkboxes/selects disabled + `aria-disabled`, note band top "Only an owner can change configuration. Ask an owner — ‹owner names›."), **dirty** (save bar), **saving** (buttons disabled, "Saving…"), **saved** (status line), **save failed** ("Couldn't save — ‹reason›. Your changes are still here." role=alert), **stale** (another owner saved first → server returns conflict → "Configuration changed since you opened this page. Reload to see it, then reapply your edits." with a Reload link).
- Storage: `WorkspaceFieldConfig` rows (workspaceId, docType, fieldKey, editable, required, width, position). Absent row = defaults (editable, required = template's `required`, width normal, canonical order).
- Consumers: `lib/configuration/field-table.ts` — `resolveFieldTable(workspaceId, docType)` (pure merge + cached per request); `applyFieldConfigToFields(fields, table)` used by the document page (pane) → sets `required`, and a new `readOnly` on the definition consumed by FieldRow (input `readOnly`, slate-50 bg, lock glyph title "Not editable — set in Admin › Configuration"); `orderQueueColumns(columns, table)` used by QueueScreen — columns with `fieldKey` follow the table's order, Hidden columns drop from the default set, width maps to `min-w` classes; columns without `fieldKey` keep their place after ordered ones. Applied only when no saved view is active (a saved view keeps its own columns — the boundary in decision 11).

### C. Configuration › Autonomy (`/autonomy`)
The existing AutomationConfigForm, now: h1 "Autonomy", intro = its old status sentence; groups: ladder · Confidence to publish · What blocks a publish · Policy · Confidence by amount (5 panels — over the ≤4 rule; **Policy folds into "What blocks a publish"** as its last row → 4). Save moves to the shared sticky bar (Save + Discard). Members: read-only rendering of the same form (`readOnly` prop, every control disabled) + "Ask an owner" band, instead of 404. Consequence sentence added to "What blocks a publish": "A required field with no value also holds a document in review — Required is set per field under Fields."

### D. Configuration › Checks (`/checks`)
WarnChecksAdmin relocated: h1 "Checks", intro "Your own soft rules. A check that fires never blocks a document — it holds it in Exceptions with the wording you give it." Words: "Predicate" → **When**; the "Reference" panel → **Fields you can test** with the variable list only, no source paths; "Rules" heading → "Your checks". Members read-only + band.

### E. Configuration › Intake (`/intake`)
Two panels: **AI extraction** (WorkspaceAiToggle, block variant with explanation "Off: documents are stored and searchable, nothing is extracted until it is turned back on."), **Email intake** (address + Copy, Recent mail, Allowed senders — relocated, Panel grammar). Email intake off on the deployment: the address panel says so (existing copy). Not available (healthcare): panel hidden with one line.

### F. Configuration › Tax (`/tax`) — was "Jurisdiction"
Panels: **Tax jurisdiction** (picker), **Deferred import VAT scheme**, **Goods or services by category** (categories page folded in). Module off → the page says "Tax is not part of this workspace's modules." with a link to What's on.

### G. Configuration › Payments (`/payments`)
Payer accounts panel only (supplier terms move to Suppliers). Intro: "The bank accounts a payment batch is paid from."

### H. Configuration › What's on (`/whats-on`)
Modules as Ledger rows (name · description · On/Off toggle with explanation "Turning a module off hides it. Nothing already in it is deleted."), unplugged modules (worksheets/expenses/dictation/files) hidden. Then **Document templates** and **Report templates** sections (relocated contents; each headed by a one-line note "Pending the owner's decision on #256; still reachable here."—no: internal ticket numbers are not UX copy → "Kept here while worksheets are unplugged.").

### I. Approval Flows (`/admin/approval-flows`)
The existing approvals page content on the Admin shell (h1 "Approval Flows"). Default flow selector is #253's — a one-line note under the h1 states the fact in force today: "Approvals start by hand from the Invoices bulk bar. A default flow that starts on its own is coming with Approval Flows' next release." → **no**: promises are not UX copy. Use only the fact: "Approvals start by hand from the Invoices bulk bar."

### J. PO Mismatch Flows (`/admin/po-mismatch-flows`)
Panel **Tolerances**: PO quantity tolerance (moved from Workspace › Matching) with its consequence sentence; Panel **Match history** = existing matches page content read-only. Who-approves is #253.

### K. Suppliers (`/admin/suppliers`)
Four panels, one supplier vocabulary ("supplier", not "vendor"): **Who can skip review** (trust table) · **What gets filled in automatically** (coding history) · **Coding rules** (rules table + Add a rule for owners) · **Payment terms and bank details** (from Settings › Payments). Empty states as today. Module gating: rules panel only with `supplier-rules`; trust/history only with `touchless-automation`.

### L. Integrations (`/admin/integrations`)
Panels: **Ledger connection** (per #248 input: status line Connected / Needs reconnect / Provisioning… / Not started, Sync now, Open ledger primary — uses existing IntegrationsManager's accounting connections section), **API keys and webhooks** (IntegrationsManager), **Account mapping** (table, when a connection is active; else one line "Connect a ledger to map categories to accounts."). `?error=` from `components/accounting/error-banner.tsx` rendered at top. Absent from nav when `config.integrations.enabled` is false; direct hit → "Integrations are off on this deployment."

### M. Users (`/admin/users`)
This company's members (until #254): h1 "Users", intro "People with access to ‹company›. Owners manage access; reviewers sign off on close; members upload, review and export." Panels: **Members** (MembersTable), **Invitations** (owner). The "firm/SMB mode" pill → consequence sentence on the intro: mode === firm ? "At least one reviewer is on the team, so close needs a reviewer's sign-off." : "No reviewer yet — the owner signs off on close." Danger zone stays at the bottom (leave/delete workspace) as **Workspace** panel.

### N. Companies (`/admin/companies`)
The workspaces this user belongs to (switcher data), as a Ledger: name · kind · your role · **Open**; **Add a company** = TeamWorkspaceForm (replaces "Create a team workspace" card). Organization creation is #254; one sentence: "Companies are grouped into an organization once you have more than one — set up on the next release of Admin." → again a promise; use "Each company is its own workspace with its own members, documents and ledger."

### O. Account (`/account`, `/account/security`)
`/account`: name/email header, links Security · Reset tour · Switch company (list) · Sign out. `/account/security`: MFA + sessions (relocated). Both on the chrome layout without SettingsNav.

## State inventory (fortify) — per component
| Component | Empty | Loading | Error | Partial/other |
|---|---|---|---|---|
| Admin nav | n/a | server | n/a | integrations off → item absent; below md → hidden + note |
| Field table | only canonical rows (fine) | server | save failed (inline, form kept); conflict (reload notice) | member read-only band; locked Required rows |
| Save bar | hidden clean | Saving… | red inline | Discard restores snapshot |
| Autonomy | n/a | server | as today + save bar | member read-only |
| Checks | "No checks yet" (existing) | server | existing | member read-only |
| Intake | "No mail received yet" / "No additional senders" | server | healthcare: hidden | email off on deployment |
| Tax | no jurisdiction set → owner picks | server | module off → one line + link | member sees value only |
| Suppliers | 3 existing empties + "No suppliers yet" | server | — | module-gated panels |
| Integrations | no connection → mapping line | server | ?error banner | non-owner note |
| Users | 1 member (owner) | server | existing guards | invitations only for owner |
| Companies | 1 workspace | server | create failed (form's own) | — |
| Redirect routes | — | 308 | — | — |

## Copy matrix (articulate) — every new string
- Rail: "Admin". Nav captions: "Organization", ‹company name›. Links: Companies · Users · Configuration · Fields · Autonomy · Checks · Intake · Tax · Payments · What's on · Approval Flows · PO Mismatch Flows · Suppliers · Integrations.
- Read-only band (members): "Only an owner can change this. Ask an owner: ‹Name, Name›." (names from members with role owner; if none visible: "Ask an owner.")
- Phone note: "Admin is a desktop area. Open DocuBite on a computer to make changes."
- Save bar: "Save changes" · "Discard" · "Unsaved changes" · "Saving…" · "Saved" · error: "Couldn't save — ‹server reason›. Your changes are still here."
- Fields intro: as in B. Width options: Hidden · Narrow · Normal · Wide. Lock: "Checks read this field, so it stays required."
- Autonomy consequence row: "A required field with no value holds the document in review. Which fields are required is set under Fields."
- Checks: "When" · "Fields you can test" · "Your checks".
- Tax module off: "Tax is not one of this workspace's modules." link "See what's on".
- Integrations off: "Integrations are off on this deployment." Mapping without connection: "Connect a ledger to map categories to its accounts."
- Users mode sentence: as in M. Companies intro: as in N.

## Accessibility (include)
- Landmarks: rail `nav[aria-label=Workspace]` (exists), admin `nav[aria-label=Admin]`, `main` once per page; h1 per page then h2 panels (Panel renders h2) — no skipped levels; sub-nav group `aria-labelledby` the Configuration link.
- Field table: `<table>` with `<caption>` (sr-only), `th scope=col`, every control labelled with the field name; order buttons keyboard-operable (no drag); first/last disabled with `aria-disabled` not `disabled` so focus is kept.
- Doc-type switcher: `role=tablist`/`tab`, ←/→, Home/End; `aria-controls` the table.
- Save bar: buttons reachable in tab order at the end of the form; status `aria-live=polite`; error `role=alert`.
- Read-only: controls `disabled` + the band explains why (visible, not `title`).
- Contrast: pills ≥4.5:1 (emerald-800 on emerald-50; slate-700 on slate-100); no slate-500 under 13px on colour.
- Targets ≥ 32×32 in nav and table controls; 44 on the phone note's link.

## Pre-flight against the scorecards
critique H1 status: save bar + saved line + read-only band say where things stand → 4. H2 real world: Tax, When, supplier (not vendor), consequence sentences → 4. H3 control: Discard, remove-field inline confirm with what stays, no autosave → 4. H4 consistency: one grammar (Panel/Ledger), one nav, one Save pattern → 4. H5 prevention: locked Required rows, beforeunload, conflict notice → 4. H6 recognition: company name in the nav caption; consequences beside controls → 3–4. H7 efficiency: keyboard tablist, deep-linkable `?type=`, everything ≤2 clicks from the rail → 3. H8 minimalism: ≤4 groups per screen, no cards → 4. H9 recovery: inline errors that keep the form; member band names a person → 4. H10 help: explanations visible on every toggle, intro sentence per page → 3–4.
evaluate: visibility (save state) 0 · match (words) 0 · control (discard) 0 · consistency 0 · prevention (locks, confirm) 0 · recognition 0–1 (custom fields created elsewhere — named in the intro) · flexibility 1 (no search on long supplier tables — existing) · minimalist 0 · recovery 0 · help 0 → ≥ 92; anti-patterns: none (no prechecked consent — the only default toggles are the ones already on; no nagging).

## Lessons applied (both files)
- States and consequences in the spec before code (generic #250/#251) → inventory above, consequence copy per control.
- Number/row summarises pane → single function (`resolveFieldTable`) feeds pane, queue and table.
- `from=` on hops: Admin links are rail-level, bare (per #244 rail rule); the one hop (Users → Open company) is a rail-level switch, bare.
- Popover offsets: none introduced.
- Residue: 5 app-wide detector findings named, not spent on.
- Seed: dev workspace needs a custom template field and ≥2 members to render every state — extend via a script.
- Detector runner from the scratchpad; dev server on :3000 with DEV_AUTH_BYPASS.

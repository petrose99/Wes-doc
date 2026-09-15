---
target: "#231 incumbent Settings + Controls (Admin baseline)"
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/(chrome)/settings"
timestamp: 2026-09-15T23-27-40Z
slug: app-app-workspaces-workspaceid-chrome-settings
---
⚠️ DEGRADED: single-context for Assessment B (sub-agent could not run Bash; detector run inline by the parent). Assessment A ran as an isolated sub-agent, source-only; parent captured screenshots afterwards. Mode: Operate. Ticket: #231 (map #226) — incumbent Settings + Controls as the Admin area's baseline.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Dirty-state + beforeunload on Controls Settings; toasts everywhere. Settings tab row above the h1 with no page context. |
| 2 | Match system / real world | 3 | "Jurisdiction" for Tax; "SMB mode" pill explained only by tooltip; warn-check reference cites `lib/gates/`. |
| 3 | User control and freedom | 3 | Confirm dialogs on destructive member actions, Touchless preview. No Discard on the long Controls form; no undo after Remove member. |
| 4 | Consistency and standards | 1 | Two design systems (shadcn Card vs Panel/hairlines), two "Settings" labels, two "Rules" (settings/rules vs automation/vendors), two tab grammars, duplicate gear icons. |
| 5 | Error prevention | 3 | Last-owner/last-reviewer guards, band validation, dry-run warn checks. `settings/budgets` registered (lib/modules/index.ts:90) with no page → 404. |
| 6 | Recognition rather than recall | 2 | Approvals empty state sends you to "Settings → Modules" in the other tree; Warn checks reachable only by URL. |
| 7 | Flexibility and efficiency | 1 | No shortcuts, no bulk member actions, no search on Members/Vendors/Rules, switcher is an unfiltered scroll. |
| 8 | Aesthetic and minimalist | 2 | Workspace page = seven equal cards; 8–11 flat tabs wrap to 2 lines at 1440, 3 at 390 (confirmed by screenshot). |
| 9 | Error recovery | 3 | Field-adjacent errors; some raw server strings reach toasts. |
| 10 | Help and documentation | 2 | Good panel notes; inline toggle explanation hidden in `title`; only reference block is for developers. |
| **Total** | | **23/40** | **Acceptable** |

## Design specificity verdict

Split. Controls is authored for DocuBite (controls-spine.tsx, autonomy ladder, Touchless impact estimate). Settings is category-interchangeable shadcn (text-3xl h1, stacked Cards, text-muted-foreground). The two areas don't share a visual language; every click between them crosses a product seam.

Deterministic scan: static `impeccable detect` → 2 findings (gray-on-color, `text-slate-500 on bg-red-50`, category-account-mapping-table.tsx:76, category-nature-table.tsx:100).

In-page detector (live dev server, 1440 / 390):

| Surface | 1440 | 390 | Page-specific (beyond 5 shell-level findings) |
|---|---|---|---|
| settings/workspace | 10 | 9 | nested-cards ×3; low-contrast 4.3:1 on "Owner" pill |
| settings/modules | 11 | 8 | low-contrast 4.3:1 on "On" pills ×3; line-length ×2 |
| settings/rules | 7 | 5 | line-length |
| automation (Controls) | 6 | 5 | — |
| automation/settings | 10 | 5 | line-length ×4 (87–150 ch) |
| automation/approvals | 11 | 9 | tiny-text 11px ×2; text-occlusion ×2 in stage details |

Shell-level findings shared by every page: ai-color-palette on the switcher avatar ×2, text-overflow on the switcher name (1440), overused-font Inter, layout-transition height on body, dark-glow on body — the shell's, not this ticket's. No page errors.

## Priority issues

- [P1] Two admin trees, two "Settings", two "Rules". Fix: one Admin tree. Command: organize → impeccable shape.
- [P1] Settings and Controls render as two products (Card+text-3xl vs Panel+font-display 26px+#e6ebf1; 128px column jump). Fix: Panel/Ledger as the admin primitive; hex hairlines to tokens. Command: impeccable extract, layout.
- [P1] 8–11 flat settings tabs, duplicate icons, dead settings/budgets link. Fix: ≤4 groups; add landmark icon; ship or drop budgets. Command: organize, impeccable distill.
- [P2] /settings/workspace is seven unrelated cards with no primary. Command: impeccable distill, layout.
- [P2] Warn checks is an orphaned owner-only page with developer copy. Command: articulate, impeccable clarify.

## What's working

1. controls-spine.tsx — annotated pipeline with jointAria.
2. automation-config-form.tsx Touchless confirm with 30-day impact estimate.
3. setting-toggle.tsx — mandatory one-sentence explanation on every admin toggle (#208).

## Persona red flags

Alex: no keyboard path; one-row members; no search on Vendors; single bottom Save. Sam: settings-nav has no aria-label; mode pill title-only; inline toggle explanation needs hover; spine counts read "Review 14"; line-through as disabled. Priya (six client companies): unfiltered switcher with identical initial tiles; every setting configured six times; account-level Security inside each workspace; no cross-workspace membership view; firm mode derived per workspace.

## Minor observations

Templates tab still first-class though Worksheets are unplugged (#238) and Modules lists Worksheets "On"; three avatar treatments; settings/email toLocaleString server-side; "Health Checks" the only two-word bottom item; padEnd alignment in warn-check list.

## Questions to consider

1. Is Controls actually Admin wearing a work-surface costume?
2. Should the Admin landing be a spine rather than a tab strip?
3. Should Admin be sectioned by scope (You · This company · This organisation)?
4. Should "is this a firm-managed client?" be asked once rather than derived?
5. Why doesn't every consequential admin change get the Touchless 30-day-impact treatment?

---
target: "Workspace Dashboard (incumbent landing) — before baseline for #238, map #226"
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/page.tsx"
target_fingerprint: "sha256:a243ee003a6c222759ac327ee27a1f993da6e9979a4482719af0f1fab5420f6a"
target_path: /home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/page.tsx
timestamp: 2026-09-15T20-28-33Z
slug: app-app-workspaces-workspaceid-page-tsx
---
Method: dual-agent (A: general-purpose design-review subagent, source + screenshots at 1440/390 viewport and full page · B: general-purpose detector subagent — static `impeccable detect --json` + in-page `detect.js` via headless Chromium against the running dev server, seeded workspace). Mode: Operate. This is the *before* baseline for #238 (map #226): the page leaves the landing route and survives one release behind `DASHBOARD_LANDING`; it is measured, not polished.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Contradictory status: aging panel "ZAR 7,980 outstanding" vs KPI tile "Total outstanding ZAR 0" (page.tsx:248 vs stat-cards.tsx:26); four review counters, two values; no loading state — one blocking `Promise.all` of 12 queries |
| 2 | Match System / Real World | 3 | Domain words right; but "Unknown supplier · Uncategorized / Ready for a look" ×3 identifies nothing; "ready for a worksheet" assumes the term |
| 3 | User Control and Freedom | 3 | Every card links out; "Documents this month" tile looks clickable and isn't (page.tsx:112) |
| 4 | Consistency and Standards | 1 | Two panel systems (`rounded-2xl shadow-panel` vs `rounded border p-4`), two eyebrow sizes, three destinations for "go to review", "Spend by category" heading rendered twice (page.tsx:260 + spend-by-category-chart.tsx:16), all-time vs 30-day counts side by side unlabelled |
| 5 | Error Prevention | 3 | Read-only; only the misleading counters mislead |
| 6 | Recognition Rather Than Recall | 2 | Review rows indistinguishable; "Today" caption over Archive/Controls/Worksheets; Receipt icon reused for Invoices and Receipts (sidebar.tsx:126,130); "Close" is a bare verb |
| 7 | Flexibility and Efficiency | 1 | Pure launcher: no shortcut, no bulk path, every action is one extra hop |
| 8 | Aesthetic and Minimalist | 1 | 17 targets, 7 headings, 4+3 KPI tiles, two empty chart panels (~600px @1440, ~900px @390), empty Recent files is the largest card |
| 9 | Error Recovery | 2 | No error state for any of the 12 queries — one throw takes the page |
| 10 | Help and Documentation | 2 | `WelcomeTour` once; nothing contextual after (why "Review 6" ≠ "Awaiting review 2") |

**Total: 20/40 — Acceptable (bottom of band).** Design specificity: category-interchangeable with one authored idea buried inside it — the ranked Next-best-action card (page.tsx:147–183). Everything below it is the generic dashboard kit; the page's own comment (page.tsx:62–65, "one shared, priority-ranked queue rather than a broad dashboard") describes a decision the page then grew back over.

## Detector evidence

Static `impeccable detect --json` over page.tsx + components/dashboard + stat-cards + sidebar + mobile-tab-bar: **0 findings** (exit 0). In-page `detect.js`: **10 @1440 · 8 @390**.

| Rule | Where | Verdict |
|---|---|---|
| nested-cards ×2 | analytics empty states draw a dashed bordered box inside the `rounded-2xl` card (page.tsx:259/263 wrapping spend-by-category-chart.tsx:17, vendor-spend-chart.tsx:12) | real — A independently flagged the double framing and the duplicated `<h2>` |
| line-length | "Spend by category" empty-state `<p>`, ~152 ch at 1440 | real |
| gray-on-color | next-action chips `hover:bg-indigo-50` with `text-slate-600` until `hover:text-indigo-700` (page.tsx:162) | real, minor, ~6:1 |
| ai-color-palette ×2 | workspace switcher's emerald gradient avatar (switcher.tsx:19) | false positive — brand emerald read as cyan, shell not page |
| text-overflow | switcher name `truncate` span, 18px | false positive — intended ellipsis clip |
| overused-font · layout-transition · dark-glow | `body` — Inter repo-wide, a global `transition: height`, `#ffba00` glow from the Next dev indicator | baseline / not shipped UI |

Where A and B agree: the analytics tail (empty, double-framed, double-headed) is the page's worst region. Where B caught what A didn't: the chip hover contrast. Where A caught what no detector can: the ZAR 7,980 vs ZAR 0 contradiction, the four review counters, the two panel systems.

## Overall Impression

A warm opening (greeting, name) then a page that repeats one fact four ways, disagrees with itself about money, and ends on ~1000px of empty panels. The single biggest opportunity is the one #237 already took: make the queue the home and let the two good ideas here — ranked next action and the aging summary — survive somewhere they earn their place (#229 for aging).

## What's Working

1. **Next-best-action** (page.tsx:66–87): ranked priority, one black CTA, chips for the rest, a real "All caught up" state.
2. **`AgingSummary`**: sentence summary, tabular numerals, proportional bar, every row deep-links into the queue with the aging filter applied; hides nothing when empty.
3. **Rail semantics** (sidebar.tsx:185–196): `aria-current`, visible focus ring, sr-only badge text in compact mode, labelled `role="group"` pairs.

## Priority Issues

- **[P1] Contradictory money and counts on one screen.** "ZAR 7,980 outstanding" (aging, unpaid bills) vs "Total outstanding ZAR 0" (analytics, 12m); "Review 6" vs "Awaiting review 2" (stage count vs tasks). A finance page that disagrees with itself forfeits trust in every number. Fix: one source per concept; label periods; never "outstanding" twice with two meanings. `/impeccable harden` → `distill`.
- **[P1] Two-thirds of the page is empty or redundant chrome.** Empty Recent files is the largest card; two chart panels and four ZAR 0 tiles render unconditionally; three stat tiles restate the queue card. Fix: render finance panels only with data; drop the tiles; remove the duplicate `<h2>`. `/impeccable distill`.
- **[P1] Two visual systems on one surface.** `StatCard` (`rounded border p-4`, 12px eyebrow) vs every other panel (`rounded-2xl shadow-panel`, 11–11.5px). Fix: one panel token, one label scale. `/impeccable layout`.
- **[P2] Review preview rows are unidentifiable.** Three rows "Unknown supplier · Uncategorized / Ready for a look"; € and $ amounts in a ZAR workspace with no cue. Fix: filename/upload-time identity fallback, base-currency cue, a real reason string. `/impeccable clarify`.
- **[P2] The H1 is the loudest element and says nothing.** 33px "Welcome back to …" over a 15.5px task line; on 390 it pushes the CTA below the fold. Fix: demote greeting, promote the task. `/impeccable typeset`.

## Persona Red Flags

**Alex (power user)**: mandatory click-through (home → queue → item); three targets for one URL; no bulk or "open next". Alex bookmarks `/invoices` — the ticket's own argument.
**Jordan (first-timer)**: "ready for a worksheet", "Controls", "Archive", "Close" unexplained; three identical review rows; "ZAR 0" under "ZAR 7,980" reads as broken.
**Sam (screen reader / keyboard)**: "Spend by category" announced twice; a non-interactive tile styled like its two link siblings; expanded-rail badge read as a bare number after the label; on 390 the dev "N" indicator occludes the Dashboard tab label.

## Minor Observations

Four corner radii (11px / 2xl / full / 4px); stat tiles lift-and-glow on hover while nothing else moves; `w-[74px]` will clip "3 months ago"; three verbs for "go there" (Open →, View all, Open Invoices); "This period" never named (hard-coded 12m); `void reviewTaskCount; void TYPED_DESTINATIONS` dead props; server-clock greeting; "Close" with a CheckCircle icon.

## Questions to Consider

1. If the Next-best-action card is the thesis, why does anything else on this page exist?
2. Which of the four review numbers would the business bet money on — can the other three be deleted rather than reconciled?
3. When the home becomes the Invoices queue, do the two good ideas here survive the move, or did the redesign keep the chrome and throw away the idea?

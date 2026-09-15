---
target: "Invoices list screen (map #177)"
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/(chrome)/invoices/page.tsx"
target_fingerprint: "sha256:94424c7fecaec2530339b1f249020580cf534208e459ded9e228a8b816f5c2a8"
target_path: /home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/(chrome)/invoices/page.tsx
timestamp: 2026-09-15T16-31-38Z
slug: aces-workspaceid-chrome-invoices-page-tsx-6341efca
---
Method: dual-agent (A: forked design-review subagent · B: parent context — static `impeccable detect` + in-page `detect.js` via headless Chromium against the running dev server, seeded with 4 invoices / 3 receipts).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Row-click shows "Loading…" inside an 800px slot; Status column reads "—" on every row while glyphs/badges carry real state elsewhere |
| 2 | Match System / Real World | 3 | "Blocked by a check", "Override Mode", "Gates", "SMB ceiling" are internal vocabulary |
| 3 | User Control and Freedom | 2 | Three independent filter systems, no clear-all; expanding a row pushes the list off-screen |
| 4 | Consistency and Standards | 1 | Detail opens below the row, History opens left of the table, standalone route opens a full page — three panel positions for one document |
| 5 | Error Prevention | 3 | Confirm dialogs + eligibility strips good; Override strip is a permanent banner even with zero gates |
| 6 | Recognition Rather Than Recall | 2 | Filter state split across three rows; Views picker shows no current-view name |
| 7 | Flexibility and Efficiency | 2 | Bulk bar real; no keyboard row nav, no sort, no density |
| 8 | Aesthetic and Minimalist Design | 1 | Nine chrome layers before the first row (y=594 of 900); 896px column with 154px dead gutters each side at 1440px; header cells wrap |
| 9 | Error Recovery | 2 | Panel errors are one red sentence, no retry |
| 10 | Help and Documentation | 2 | Override strip explains itself; nothing else does |
| **Total** | | **20/40** | **Acceptable (bottom of band)** |

## Design Specificity Verdict

**LLM assessment:** category-interchangeable. Swap the wordmark and this is any shadcn admin template. The map's destination (queue fills the screen, right-hand detail beside the source, user never leaves the list) is not visible anywhere. What shipped is the old BillsPage card with more strips stacked on top.

**Deterministic scan (static):** 3 findings — 2× `border-accent-on-rounded` (tab underlines, precedented per #218) and 1× `gray-on-color` in `saved-view-picker.tsx:200`. The static scan misses the structural problem entirely.

**In-page detector (desktop 1440 / desktop with History panel / mobile 390):** 23 / 27 / 20 anti-patterns. Categories: `nested-cards` ×7 (Card inside the reading column inside the shell), `low-contrast` ×9 (`text-slate-400` 2.6:1 on white — aging-card totals, "inferred" tags, panel timestamps; 2.4:1 on slate-100; white-on-emerald 3.5:1), `undersized-ui-text` ×9 (10px aging totals, 10.5px "TODAY" and mobile nav), `text-overflow` (History panel title), `line-length` ×2 (the two explanatory sentences), `cramped-padding`, `layout-transition: height`, `ai-color-palette` ×2 (cyan gradient), `overused-font`.

**Measured boxes (1440×900):** rail 236px · reading column 896px starting at x=390 · card 800px · table 798px · first data row at y=594 (66% of the viewport is chrome).

## Overall Impression
The row anatomy is Vic-class; everything around it is the old page. The queue is trapped in a settings-page reading column with a card, and the "one screen" idea has been implemented as two different panels in two different places, neither on the right.

## What's Working
- Row anatomy: processing glyph, per-field confidence underline, countdown badge, 62px rhythm.
- Bulk bar with count-bearing confirm ("Approve Invoices (1)") and eligibility strip.
- Sidebar rail is calm, paired, badges only where they mean something.

## Priority Issues
- **[P0] The queue lives in an 896px reading column with a card around it.** `(chrome)/layout.tsx` applies `max-w-4xl p-6` to every route including operator queues; `BillsPage` wraps the table in `Card`. Work area is 800px at 1440 and still 800px at 1920. Fix: list routes opt out of the reading column, drop the Card, table takes the whole width. `/impeccable layout`.
- **[P0] Detail opens in the wrong place and pushes the list away.** `InlineDocumentPanel` renders as a colSpan row under the clicked row, capped at 75vh; the split pane is squeezed into 798px and later rows are shoved off-screen. Fix: persistent right pane (~55–60%) beside the queue; row click selects, pane shows SplitPane; ↑/↓ moves selection. `/impeccable shape`.
- **[P1] History is a second, left-side panel that shrinks the table below its min-width.** `SelectionAuditPanel` (w-72) mounts left of the table on one checked row; table overflows ("AMOU…" cut). Two triggers open two panels for one document. Fix: Approval/Audit/Gates become tabs of the single right pane; checkbox is bulk selection only. `/impeccable distill`.
- **[P1] Nine stacked layers before data.** H1+subtitle, legacy All/Unpaid/Blocked pills, Touchless metric, six aging cards, Views+Status, Invoice Approval, "4 invoices" card header+subtitle, Override strip, table head. Fix: one toolbar row; metric as an inline stat; Override as a menu item; delete the card header and both sentences. `/impeccable distill` then `layout`.
- **[P2] Three filter systems overlap semantically** ("Unpaid" vs Status "Paid"; "Blocked by a check" vs Gates). Fix: one taxonomy, one row. `/impeccable clarify`.

## Persona Red Flags
- **Alex (power user):** no row keyboard nav, no sort, every action is a mouse click on a 16px checkbox; opening a second invoice requires closing the first; ~4 rows visible above the fold.
- **Sam (screen reader / keyboard):** supplier link's `aria-expanded` has no `aria-controls`; two `role="region"` panels appear/disappear with no focus management; active chip is colour-only; "—" Status reads as "em dash".

## Minor Observations
Header cells wrap ("INVOICE #"); ISO dates; "Touchless rate 0% — 0 of 7" is a demoralising first-load stat; Override strip copy is a paragraph; Status column is redundant with glyph + badges; sidebar "Close" floats unexplained between groups.

## Questions to Consider
1. If the table were the only element above the fold, what would the operator actually miss?
2. Why does one invoice have three doors (row link, checkbox panel, standalone route)?
3. What would this screen look like if the source PDF were visible for the selected row at all times, and everything else had to justify its pixels against that?

---
target: "Archive (/library) as the lookup → queue hand-off — journey evidence for #239, map #226"
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:/home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/library/page.tsx"
target_fingerprint: "sha256:8a2ceecb0ca2bb3e0d5d060b758b293b930b105482b5276150ea908239dd264c"
target_path: /home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/library/page.tsx
timestamp: 2026-09-15T22-25-51Z
slug: app-app-workspaces-workspaceid-library-page-tsx
---
Method: dual-agent (A: general-purpose design-review subagent, Playwright screenshots at 1440/390 — grid, list view, one card opened · B: general-purpose detector subagent — static + in-page `detect.js` at both widths). Mode: Operate. Journey evidence for #239 (map #226): scored as the Archive → typed queue → back hand-off.

## Design Health Score — 17/40

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 1 | Cards show template, category, date, never lifecycle; `LIBRARY_WHERE = { status: "reviewed" }` (`models/documents.ts:244`) includes invoices still "Approval — in review" while the copy says "permanent record" |
| 2 | Match System / Real World | 2 | "Archive" implies done but holds anything extracted; the pane's stage button is also labelled "Archive" |
| 3 | User Control and Freedom | 1 | No return path; origin context (`q`, facets, page, view) dropped on the redirect chain (`documents/[documentId]/page.tsx:308-313` forwards only `stage/page/bb`) |
| 4 | Consistency and Standards | 1 | Second grammar: centred `max-w-6xl` column, `text-xl` H1 (`page.tsx:94-98`), cards vs 62px rows, own facet bar with native `<select>`s and `window.location.href` (`library-facet-bar.tsx:74`), no Detail pane |
| 5 | Error Prevention | 2 | Facet change reloads and loses the typed query; untyped docs open `/library/documents/{id}` whose Back goes to `/pipeline` (`split-pane.tsx:225`) |
| 6 | Recognition Rather Than Recall | 2 | Supplier-first titles and type chips with counts (good); "Unknown supplier" ×2 fall back to filename; no amount/number on 7 of 9 cards |
| 7 | Flexibility and Efficiency | 2 | Grid/list, scope, Ask AI persist in URL; no keyboard row model, no sort by supplier/amount, no "open in queue" |
| 8 | Aesthetic and Minimalist | 2 | Five toolbar controls in one card; unlabelled flag checkbox (`library-toolbar.tsx:107-115`) |
| 9 | Error Recovery | 2 | Empty state separates "no match" from "nothing yet" with clear-filters (`page.tsx:144-154`); no state for "document moved" |
| 10 | Help and Documentation | 2 | Subtitle explains scope; scope select and Ask AI unexplained |

## Design Specificity Verdict
Generic. A stock document-library template; nothing specific to lifecycle-driven queues.

## Detector evidence (Assessment B)
Static: 0. In-page: 44 @1440 (38 real) · 42 @390 (37 real). `low-contrast` ×18/width — filename `text-slate-400` on white 2.6:1 (`library-results.tsx:57` ×9) and category pill `text-slate-500` on `bg-slate-100` 4.3:1 (`:63` ×9); `undersized-ui-text` ×19/width — 10px doc-type pill (`:35`), category pill (`:63`), "FX pending" (`:69`); `line-length` ×1 @1440 — header description ~158ch (`page.tsx:102`). Counts will rise with data (`text-slate-400` meta rows at `:65, :97, :124, :154` carried no text at this seed).

## What's Working
- Shell kept on open; landing in the typed queue with the row selected is the right destination.
- Supplier-first titles, type chips with live counts, per-chip clear.
- Honest empty and degraded-search states; URL-encoded filter state.

## Priority Issues
- **P0** No way back; origin context dropped (CONTEXT.md "Origin context").
- **P0** Wrong contents or wrong word: `status: "reviewed"` includes open in-approval invoices; duplicates the queue's open set instead of answering "Closed".
- **P1** Second grammar; should reuse QueueScreen with all-types columns.
- **P1** Lifecycle invisible on the card.
- **P1** Orphan detail route for untyped docs (Back → `/pipeline`).
- **P2** Mobile toolbar: search collapses to an icon box; flag toggle unlabelled; tab bar covers the third card.
- **P2** "Unknown supplier" rows have only the filename.

## Persona Red Flags
- End-of-day operator cannot filter "what did I finish today": no status facet, date facet is receivedAt.
- Supplier on the phone: finds "Acme Corp", lands in Invoices with Approve/Reject live.
- Keyboard user: facet `<select>` change hard-navigates; flag checkbox announces only "checkbox".

## Hand-off defects (journey evidence)
1. Context not carried: `q`, `type`, `category`, `supplier`, `from/to`, `view`, `page` dropped at `documents/[documentId]/page.tsx:308-313`.
2. Duplicate answers: Archive = `status: reviewed` ⊇ Invoices open set; the queue's "Closed" facet (`invoice-queue.tsx:35`) already answers "processed".
3. Second grammar one click from the queue.
4. Missing way back: no "Back to Archive"; pane Close returns to Invoices.
5. Vocabulary collision: "Archive" the destination vs "Archive" the pane action.

## Questions to Consider
- Does Archive adopt the queue shell (map fog: Attachments / Archive), or does it become the queue's "Closed" view?

---
target: "PO mismatch resolution inside the invoice row — View PO row, breakdown, Match manually, Purchase Orders column, PO queue + pane (#250, map #226)"
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/ubuntu/Dev/Wes-doc/components/documents/po-compare.tsx"
target_path: /home/ubuntu/Dev/Wes-doc/components/documents/po-compare.tsx
timestamp: 2026-09-16T02-25-00Z
slug: components-documents-po-compare-tsx
---
⚠️ DEGRADED: Assessment B ran in the parent context (the autopilot driver denies sub-agents a shell), before Assessment A. Assessment A ran twice as isolated `general-purpose` sub-agents (design review from the 1440/390 screenshots and sources, no detector output shown): round 1 on the built surface, round 2 to confirm the fix batch. Mode: Operate. This is the *new* surface's score — the incumbent had no line items or PO matches to render (#228: code-level critique only), so there is no incumbent number to beat.

## Design Health Score (round 2, confirm)

| # | Heuristic | R1 | R2 | Key issue (R2) |
|---|---|---|---|---|
| 1 | Visibility of System Status | 3 | 3 | Escape with pending picks — now says "Save or discard your line matches first." |
| 2 | Match System / Real World | 3 | 4 | Sentence-first breakdown; "0 · 22 over" on the PO pane |
| 3 | User Control and Freedom | 2 | 3 | Discard when dirty, Escape when clean, focus returns to the glyph, `from=` on every hop |
| 4 | Consistency and Standards | 2 | 3 | One `LineMatch` feeds row, chip, header and PO pane; pills Match / Mismatch / Not compared / No PO line |
| 5 | Error Prevention | 3 | 3 | Reject dialog names cells, gate, send-back, audit |
| 6 | Recognition Rather Than Recall | 3 | 3 | PO value under every cell with a PO prefix; visible legend |
| 7 | Flexibility and Efficiency | 2 | 3 | Named glyph buttons with aria-expanded; cards under 560px; per-row labelled pickers |
| 8 | Aesthetic and Minimalist | 3 | 3 | Calm compare row; `=` on description carries no arithmetic |
| 9 | Error Recovery | 3 | 3 | "Could not reach the server. Nothing changed." |
| 10 | Help and Documentation | 2 | 3 | Legend, sentence-first popover, suggestion explainer |

**Total: 26/40 → 31/40.** Design specificity: the pane is authored (the compare row, the sentence naming the sibling invoice, the Match manually band that states what it compares and why); the two queues are still the shared Queue-screen grammar.

## Detector evidence (in-page `detect.js`, headless Chromium, 1440 / 390)

| State | Before (first build) | After |
|---|---|---|
| Invoices list | 9 / 6 | 5 / 5 |
| Invoice pane, View PO on | 17 / 12 | 5 / 5 |
| Breakdown open | 18 / 13 | 5 / 5 |
| Match manually | 18 / 12 | 5 / 5 |
| Purchase Orders list | 5 / 5 | 5 / 5 |
| PO pane | 16 / 12 | 5 / 5 |

The residual 5 on every state are app-wide and untouched by this ticket: `ai-color-palette` ×2 (workspace-switcher gradient avatar), `overused-font` (Inter), `layout-transition` and `dark-glow` on `body` (the Next.js dev overlay). Cleared: `clipped-overflow-container` (positioned `sr-only` spans and `td.relative` inside the pane's scroller → `hidden` description targets, no `overflow-hidden` frames), `undersized-ui-text`, `cramped-padding` (chip inset, ring instead of border), `line-length`, `gpt-thin-border-wide-shadow`, `text-occlusion` (a measurement artefact: the pointer parked on the icon rail expanded it over the list).

## Round-1 P1s, all cleared in the fix batch

Breakdown popover covering its anchor (now placed from measured height, 8px off the glyph) · hops without `from=` (#244) · Reject dialog hiding the send-back consequence · chip count vs visible glyphs (section scrolls into view on auto-open) · View PO forcing details-only and the suggested-state table collapsing (container-based cards under 560px) · no Discard in Match manually.

## Evaluate (Intent, `vigil`)

Round 1: 81/100, H3 = 2, H5 = 2 (issue scale). Round 2 after fixes: **88/100** (heuristics 44/50 · task success 31/35 · inclusion 13/15), every heuristic at 1, anti-pattern verdict Clean. Fixed between rounds: server-side candidate search (no false "no match"), Confirm on an already-compared link no longer sends a running Approval back, unsaved guard on pane close / row change / reload, per-row pending marker, one breakdown at a time with unique ids, modal sheet with Tab trap, 44px hit area, third Consumption state, copy.

Questions skipped: autopilot session (owner delegated the recommended answers).

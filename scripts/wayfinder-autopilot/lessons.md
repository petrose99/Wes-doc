# Autopilot lessons — what first passes missed, so the next one doesn't

Read in full before the pre-build pass on every execution ticket. Append at
close: one line per correction the fix loop had to make that the pre-build
should have caught. Format: `- (#ticket, heuristic) what was missed → what to
do at spec time`. Keep it under ~80 lines: when two lines say the same thing,
merge them and generalise. This file is the loop's memory; a lesson that is
not written here will be relearned at full cost.

## Pre-build (what the spec must already contain)

- (#250, H1 status) Loading, empty and zero-result states were added after the first critique. → `fortify` state inventory is written into the spec per component before code; every list, pane and popover names its empty/loading/error rendering.
- (#250, H3 control) Reject/Replace put the invoice into send-back state without saying so up front. → Any action with a side effect on another entity's state has that consequence in its confirmation copy at `articulate` time.
- (#250, H6 recognition) Popover sat on top of its anchor until measured offsets were added. → Floating surfaces (popover, sheet, tooltip) specify anchor, offset and viewport-edge behaviour in the spec; measure with the screenshot at both widths in the first inspection.
- (#250, H8 minimalism) The Purchase Orders column count did not equal the ≠ glyphs the pane showed. → When a number on a row summarises something in the pane, the spec states the single function both read from; never two computations.
- (#250, H4 consistency) Deep-link hops lost their origin until `from=` was added to every one. → Every navigation the surface introduces carries origin context (`from=`) by construction; list them in the spec.
- (#251, H1/H4) First evaluate was 68 with four P1s: the same pattern — states and consequences designed in the fix loop. → Do steps 1–3 of the pre-build pass fully; loading the skills is not doing them.

## Build

- (#250) Three detector batches were needed because the first screenshots were only taken after the whole surface was built. → Screenshot each new component at 1440 and 390 as it lands, not only at the end; the hook catches static findings, the overlay catches layout ones.
- (#250) Static `impeccable detect` was skipped; the in-page overlay found everything. → In-page overlay is the source of truth; run it per state (list, pane-open, dialog-open, sheet-open), not once.

## Scoring

- (#250, #251) App-wide residue of 5 detector findings (workspace-switcher avatar palette ×2, Inter as overused-font, Next dev overlay ×2 on `body`) appears on every surface. → Name it as residue in the report; do not spend a batch on it; it belongs to a shell ticket.

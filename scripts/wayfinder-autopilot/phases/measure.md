## Phase brief: MEASURE

**Measure never fixes.** Read the hand-off. Seed and servers up in one call;
one capture round with the build's existing round script (`shots-r0` in the
scratch folder — reuse it, do not rewrite it; never a Playwright harness
from scratch, #257 spent four sessions on one) as `shots-r1`; then the three
readers.

**One capture pass per round, shared by every skill.** A round is one run
producing a named set — every state × 1440 and 390 as PNGs, the in-page
detector JSON per state, the keyboard probe results — in the ticket's
scratch folder. `critique`, `evaluate` and `include` all read *that set*;
none opens its own browser.

**One contact sheet per round.** Tile the round's PNGs with
`node scripts/wayfinder-autopilot/contact-sheet.mjs <png-dir> --out <sheet.png>`
(copy it beside the scratch Playwright first, as with the capture runner)
and read that once. Open a full-size PNG only for a state the detector or a
reader flagged, at most eight. #252 read 133 images; each one stays in
context for every later turn.

**The readers.** Run critique, evaluate and include each as a fresh
foreground `Agent` with `model: "sonnet"`, reading the contact sheet, the
detector JSON and `keyboard.json` — never the PNG set. Judgement lived in
the spec phase; scoring does not need the strong model.

End by writing the scores (every heuristic, health, P0–P3, include verdict)
and the triage of real detector findings into the hand-off with the line
`milestone: measured`, committing (`wip(autopilot): #<ticket> measured`),
and stopping. The fix batch is the next session's, in a fresh context.
Stop the servers before you end.

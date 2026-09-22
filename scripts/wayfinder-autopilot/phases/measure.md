## Phase brief: MEASURE

This phase is **plumbing, not judgement**. You run the tooling, launch the
readers, and record what came back — exactly, in full, with no opinion on
it. Deciding which findings are real is the close session's job, on a
stronger model, and it needs the complete raw lists to do that. Do the
steps below in order; every step is one or two tool calls.

1. **Read the hand-off.** Note the scratch folder, the round script the
   build wrote (`shots-r0`), the r0 counts, and the states list.
2. **Seed and servers up in one call**, using the recipe the area primer or
   the hand-off names. If a server does not come up, retry once with the
   same command; if it still fails, write what you ran and the last 20 lines
   of its output to the hand-off, commit, post `Autopilot: continue —
   measure: servers did not start`, and stop. Do not debug it.
3. **One capture round** with the build's existing round script, unchanged,
   as `shots-r1` — never a Playwright harness from scratch (#257 spent four
   sessions on one). It produces every state × 1440 and 390 as PNGs, the
   in-page detector JSON per state, and `keyboard.json`. If a state errors,
   the script isolates it; record which. Then
   `node scripts/wayfinder-autopilot/gate.mjs shots-r1 --baseline shots-r0
   --residue-file residue.txt --json gate-r1.json` and copy its one-line
   summary to the hand-off — that is the detector count the close session
   starts from.
4. **One contact sheet** with
   `node scripts/wayfinder-autopilot/contact-sheet.mjs <png-dir> --out <sheet.png>`
   (copy it beside the scratch Playwright first, as with the capture runner).
   Do not open individual PNGs.
5. **The three readers**, each a fresh foreground `Agent` with
   `model: "sonnet"`: `critique`, `evaluate`, `include`. Give each the
   contact sheet path, the detector JSON path, `keyboard.json`, the spec
   path, and the rubric it scores against. Each reader **writes its full
   output to `<scratch>/readers-r1/<critique|evaluate|include>.md`** (every
   heuristic with score and evidence; every finding with severity, state,
   and location; the include verdict per width — nothing dropped) and
   **returns only** the score line, the health/verdict, and the P0/P1
   list, under 15 lines. Launch all three in one turn. Do not read the
   files back; the close session reads them.
6. **Record, do not triage.** Write to the hand-off: the `scores:` line,
   each reader's headline (critique total and lowest heuristics; evaluate
   health, P0/P1 count, anti-pattern verdict; include verdict per width),
   the detector counts per width per state (r0 vs r1), and under
   `## Raw findings (untriaged)` the three file paths — the lists
   themselves stay in the files, unlabelled. Then the line
   `milestone: measured`.
7. **Stop the servers**, commit (`wip(autopilot): #<ticket> measured`), stop.

No product fixes, no dismissing findings, no "this looks like residue". If a
step fails in a way the instructions above do not cover, record it on the
hand-off and hand off; the next session sorts it out.

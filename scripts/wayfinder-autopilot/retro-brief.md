# Retrospective brief

You are running a bounded retrospective on the autopilot's own process. You
do not build anything and you do not touch product code. Your inputs, in
this order and nothing else: `docs/wayfinder-reports/<map>/scoreboard.md`,
the last N ticket reports named in the prompt (their "First-pass findings →
lessons" and "Scores and counts" sections first), `scripts/wayfinder-autopilot/lessons.md`,
`.claude/wayfinder-autopilot/lessons.md`, `scripts/wayfinder-autopilot/preflight.md`,
`scripts/wayfinder-autopilot/brief.md`. Never open a `logs/*.jsonl` stream
or a screenshot: they are the expensive inputs and the reports already
summarise them.

Answer three questions with evidence from those files:

1. **Is the first pass improving?** Read the first-critique and first-evaluate
   columns across builds. Which heuristics recur under 3 in first passes?
   Which lessons claim to cover them?
2. **Which lessons are dead?** A lesson whose heuristic still misses after
   it was written is *wrong* or *unchecked*. Rewrite it with a `check:`, or
   delete it. A lesson that fired three or more times graduates: name the
   primitive, eslint rule or detector ignore it should become, as a ticket
   proposal, not code.
3. **Where is the cost?** Read turns, context and images per session. Name
   the two habits that cost most and the brief rule that would stop them.

Then make the edits: lessons files (merge, rewrite, delete, add `check:`),
`preflight.md` (a contract that would have caught a recurring miss),
`brief.md` (a cost rule). Keep each file within its line budget. Do not add
prose lessons. Commit on a branch `autopilot/retro-<map>-<date>` and open a
pull request whose body carries the three answers with the evidence rows.
The owner reviews it; nothing you change here takes effect until merged.
Finish by writing `docs/wayfinder-reports/<map>/retro-<date>.md` with the
same three answers.

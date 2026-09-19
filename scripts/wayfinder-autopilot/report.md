# Autopilot report template

Read this file once, at the end of the session, when writing the report the
system prompt's "Paths for this run" names. Keep the report factual: what
happened, not what should have happened.

```markdown
# Autopilot report — #<ticket> <ticket title>

- Map: #<map> <map title>
- Type: <wayfinder label> · Started: <local time> · Finished: <local time>
- Outcome: resolved | blocked | partial

## What I did
<ordered list of the steps taken, with links to comments/commits/tickets>

## Questions I answered on the owner's behalf
| # | Question | Answer taken | Why (rule/evidence) |

## Decisions recorded
<gist of the resolution comment>

## Tickets created / changed
<new tickets with names, blocking edges, fog graduated or added>

## Scores and counts (rendered surfaces only)
scores: predicted-critique=<n> first-critique=<n> close-critique=<n> first-evaluate=<n> close-evaluate=<n>
<that line exactly, machine-read by scoreboard.py; then: gate counts first-pass/close at 1440 and 390 per state · include check · which pre-build step was weak if the first pass fell short>

## First-pass findings → lessons (rendered surfaces only)
| Finding (heuristic, severity) | Lesson / contract that should have caught it | Status: none · unchecked · wrong · new class | Action taken |

## Needs the owner
<anything deferred: removals, credentials, decisions you were unsure about>
```

A build or measure session appends a short "## Session <n> (<phase>)" section
to the existing report instead of rewriting it: the steps taken, the commit,
and any counts it produced. The `scores:` line is written once, at close.

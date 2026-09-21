---
status: accepted
date: 2026-09-21
---

# Autopilot lanes: one worktree and branch per ticket, landed on close

Bite (the Wayfinder autopilot, `scripts/wayfinder-autopilot/run.sh`) worked every ticket in the checkout it was started from, on that checkout's branch. That made the checkout unusable while a run was on — a stash/pop froze the feed on #330, and unrelated edits were swept into #360's WIP commit — and it would not survive a second person. We decided that each ticket is worked in its own **lane**: a git worktree at `../<repo>-lanes/<map>-<ticket>` on branch `wf/<map>-<ticket>`, branched from the local tip of the **integration branch** (the branch the driver was started on), with `node_modules`, `.env` and the live helpers symlinked in. The lane branch is pushed after every session and opened as a **draft PR** from the first push; when the ticket closes at the bar the PR is marked ready and merged `--no-ff` into the integration branch in the checkout, then pushed (`LANE_MERGE=auto`). `LANE_MERGE=review` leaves the PR to a human and holds back any ticket whose blocker's PR is still open.

## Considered options

- **Keep the shared checkout** — cheapest, and the model the owner already knew; rejected because it cannot host an owner and a session at once, let alone a team.
- **Symphony-style parallel lanes** (OpenAI's `symphony`: up to N concurrent agents, each in an isolated workspace, driven from a tracker) — rejected for now. The bottleneck is tokens per ticket, not lane count; design tickets on one map share surfaces and would collide at merge; and there is one dev server (:3000) and one devdb. Lanes are sequential; the shape leaves the door open (a port per lane) without committing to it.
- **Merge on GitHub (`gh pr merge`) and pull** — rejected because the integration branch is routinely ahead of origin (20 commits today); merging on the remote would diverge it from the checkout. Merging locally and pushing keeps the checkout the source of truth and GitHub still records the PR as merged, since its head lands in the base.
- **A tracker adapter** — unnecessary: the map is already a GitHub issue whose sub-issues are the tickets and whose `blockedBy` edges are the dependency graph. The frontier is read from GitHub today.

## Consequences

- The checkout is free while Bite runs; the run-log, scoreboard and session logs stay there under `docs/wayfinder-reports/<map>/`, and only the merge at close writes to it. If that merge conflicts with uncommitted changes there, the PR stays open and the lane is kept; landing it is a manual step.
- Every ticket now has a PR — a reviewable unit with CI, a diff and a comment thread, revertable as one — even in `auto` mode, where review is after the fact. Moving to before-the-fact review is a config flag, not a rewrite.
- Each lane compiles `.next` cold on its first capture (~90 s); the shared devdb means two lanes must never run at once until ports and databases are per lane.
- Closed tickets whose PR has not merged are invisible to the frontier's `blockedBy` check; `review` mode compensates by checking the blocker's PR state, `auto` mode by landing before the next ticket starts.

# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in `petrose99/docubite`. Use the `gh` CLI for tracker operations.

## Conventions

- Read an issue with `gh issue view <number> --comments`.
- Create issues with `gh issue create`.
- Comment with `gh issue comment <number>`.
- Apply labels with `gh issue edit <number> --add-label`.
- Close resolved issues with `gh issue close <number>`.

## Pull requests as a triage surface

PRs are not treated as a request surface.

## Wayfinding operations

The Wayfinder map is an issue labelled `wayfinder:map`. Child tickets are linked from the map and carry a `wayfinder:<type>` label (`research`, `prototype`, `grilling`, or `task`). Claim a ticket by assigning it before work. Resolve it with an answer comment, close it, and append a context pointer to the map's Decisions so far. Use GitHub's native issue dependencies for blocking when available.

Mechanics, since `gh` has no first-class command for either relationship:

- **Sub-issues:** `gh api -X POST repos/petrose99/docubite/issues/<map>/sub_issues -F sub_issue_id=<child database id>`. The field takes the child's numeric `id` (from `gh api repos/petrose99/docubite/issues/<n> --jq .id`), **not** its issue number, and `-F` is required — `-f` sends a string and the API rejects it.
- **Blocking:** `gh api -X POST repos/petrose99/docubite/issues/<blocked>/dependencies/blocked_by -F issue_id=<blocker database id>`. Same id rule. Confirm with `issue_dependencies_summary` in the response.

### Design work on a map

**Any Wayfinder ticket that touches a user-facing surface is resolved by calling the Skill tool with `impeccable`**, using the sub-command the ticket names. See the "Design work goes through Impeccable" section of `CLAUDE.md` — it is a project-wide rule, not a per-map preference, and it applies whether or not the map's own Notes restate it. A map covering a user-facing surface should restate it in `## Notes` anyway, so a session that loads only the map still sees it.

Impeccable critique snapshots live in `.impeccable/critique/`. A ticket that changes a rendered surface records before/after detector counts in its resolution comment, measured against the stored snapshot.

A `wayfinder:grilling` ticket on a user-facing surface loads `impeccable` before its first round of questions, puts the design dimensions to the user **as numbered questions in the rounds** rather than settling them silently, grounds each `➡️` recommendation in craft-floor or detector evidence rather than taste, and closes its resolution comment with an ordered list of Impeccable commands for the execution session to inherit. The dimension sweep and the command vocabulary are in `CLAUDE.md` under "Grilling a design ticket".

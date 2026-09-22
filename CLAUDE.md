# DocuBite — project instructions

## Design work goes through Intent and Impeccable

**No design decision or UI change in this project is made without consulting both the `intent` skill and the `impeccable` skill.** This is not advisory and it is not scoped to one effort — it holds for every session, every map, every ticket, and every ad-hoc request that touches a user-facing surface.

The two split one job. **Intent decides *why, what and how it behaves*** — who the user is, what they are trying to do, the flow, the information architecture, the interaction and its feedback, the words, every state outside the happy path, and whether the design is honest. **Impeccable decides *how it renders*** — hierarchy, layout, type, colour, spacing, the visual form of motion, responsive rendering, and the craft floor, verified by the detector. Motion sits on the seam: Intent decides that feedback exists and what it must convey; Impeccable decides how it is animated. A decision that skipped Intent is unreasoned; one that skipped Impeccable is unfinished. Neither substitutes for the other.

"Design work" means any of: visual design, layout, spacing, typography, colour, motion, component structure, information architecture, user flows, UX copy, empty/error/loading states, responsive behaviour, or accessibility of a rendered surface. It covers both the marketing site (`app/(marketing)`, `components/marketing`) and the authenticated app (`app/app`, `components/**`).

**The gate is path-based, not title-based** (added 2026-09-22, the way CI `paths:` filters and CODEOWNERS work): a change owes the design pass when it touches a rendering file — `app/**` or `components/**`, `.tsx`/`.css`, tests excluded — and owes nothing from Intent or Impeccable when it touches only `lib/`, `models/`, `prisma/`, `worker/`, `scripts/`, `app/api/**` or `*actions.ts`. A backend change is worked out from the code and its tests; calling the design skills on it is waste, not diligence. A mixed ticket (a deletion with one reduced page, say) runs the pass for the rendering step alone, sized to it. Autopilot build plans carry `kind: surface|backend` per step, and the token-guard hook refuses an edit of a rendering file until `craft-floor.md` has been read in that session.

**Backend work has its own floor: [`CODING_STANDARDS.md`](CODING_STANDARDS.md).** It is to a backend step what `craft-floor.md` is to a surface step — the invariants (workspace scoping, sealed secrets, idempotent external writes, queue-row durability, role-checked actions, additive migrations, glossary vocabulary) and the definition of done: seams named first, tests written red first (`tdd`), `simplify` before done, `/code-review` (Standards + Spec) at close with P0 = P1 = 0. `codebase-design` when a module or boundary is added; an ADR via `domain-modeling` when the boundary is hard to reverse. The hook refuses an autopilot commit that changes `lib/`, `models/` or `worker/` logic without a test in the same commit (escape: `no-test: <reason>` in the subject) and refuses close without the review line.

How to comply:

1. **Call the Skill tool with `intent` before the work starts.** Route to the Intent skill that matches the request — `strategize`, `investigate`, `blueprint`, `journey`, `organize`, `wireframe`, `articulate`, `evaluate`, `fortify`, `include`, `transpose`, `localize`, `measure`, `philosopher`, `specify`. Establish project context once per session (users, product, constraints, ethical stance, success); say what is assumed where context is missing.
2. **Call the Skill tool with `impeccable` before the work starts**, not after it is written. Route to the sub-command that matches the request — `critique`, `audit`, `shape`, `layout`, `typeset`, `clarify`, `polish`, `adapt`, `harden`, `distill`, `bolder`, `quieter`, `animate`, `colorize`, `delight`, `onboard`, `optimize`, `overdrive`, `extract`, `document`.
   *Continuation sessions* (a ticket's hand-off file exists and its Action Summary already names the skills): the routers ran at spec — load the **named** Intent skill and Impeccable sub-command directly and read `craft-floor.md`; do not reload `intent`/`impeccable` from the top. The routers cost ~15K tokens a session and were the second-largest item in the budget that lost #286 two build sessions. *Autopilot sessions* (`scripts/wayfinder-autopilot`): the phase brief names the skills for every phase, including spec, and a hook refuses the routers — call the named skills directly; the rule is satisfied by running them.
3. **Read `craft-floor.md` before the first UI edit**, including small refinements. The skill points at it; it carries the quality floor and the absolute bans.
4. **Check every decision against the Intent anti-pattern catalog.** A finding there is a defect, named by category and severity, never a trade-off.
5. **Verify with the detector, not by eye.** `impeccable detect --json <targets>` for a static scan, plus the in-page `detect.js` overlay against a running dev server for anything viewable — the static scan alone misses almost everything (on this repo's marketing site it returned 5 findings, all false positives, while the in-page overlay returned 172 real ones).
6. **Record before/after counts** on any ticket that changes a rendered surface.

If a request would have you design something and you have not called both `intent` and `impeccable`, you are not finished — go back and call them.

## Wayfinder, Intent and Impeccable are one workflow

[Wayfinder](.claude/skills/wayfinder/SKILL.md) charts *what to decide*; Intent decides *why, what, and how the experience behaves*; Impeccable decides *how it renders*. None is skipped. **The full protocol — grilling a design ticket (Intent's and Impeccable's agendas, the Action Summary), implementing one (the four points the skills are called at, the definition of done, the closing bar: every `critique` heuristic ≥ 3, `evaluate` health ≥ 80 with every heuristic ≤ 1, detector cleared, `polish` run), how findings split into tickets vs fixes, and the list of maps carrying decisions already made — is in [`docs/agents/design-tickets.md`](docs/agents/design-tickets.md).** Read it in full before grilling or implementing any Wayfinder ticket on a rendered surface; an autopilot session gets the parts it needs through its phase brief.

Critique snapshots are archived in `.impeccable/critique/` and are the baseline any re-run is measured against.

## Repo orientation

The folder name says "Taxhacker"; the product is **DocuBite** — document inbox, AI extraction, accounting sheets. Read `CONTEXT.md` first. Tracker conventions are in `docs/agents/issue-tracker.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

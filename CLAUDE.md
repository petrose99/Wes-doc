# DocuBite — project instructions

## Design work goes through Impeccable

**No design decision or UI change in this project is made without consulting the `impeccable` skill.** This is not advisory and it is not scoped to one effort — it holds for every session, every map, every ticket, and every ad-hoc request that touches a user-facing surface.

"Design work" means any of: visual design, layout, spacing, typography, colour, motion, component structure, information architecture, UX copy, empty/error/loading states, responsive behaviour, or accessibility of a rendered surface. It covers both the marketing site (`app/(marketing)`, `components/marketing`) and the authenticated app (`app/app`, `components/**`).

How to comply:

1. **Call the Skill tool with `impeccable` before the work starts**, not after it is written. Route to the sub-command that matches the request — `critique`, `audit`, `shape`, `layout`, `typeset`, `clarify`, `polish`, `adapt`, `harden`, `distill`, `bolder`, `quieter`, `animate`, `colorize`, `delight`, `onboard`, `optimize`, `overdrive`, `extract`, `document`.
2. **Read `craft-floor.md` before the first UI edit**, including small refinements. The skill points at it; it carries the quality floor and the absolute bans.
3. **Verify with the detector, not by eye.** `impeccable detect --json <targets>` for a static scan, plus the in-page `detect.js` overlay against a running dev server for anything viewable — the static scan alone misses almost everything (on this repo's marketing site it returned 5 findings, all false positives, while the in-page overlay returned 172 real ones).
4. **Record before/after counts** on any ticket that changes a rendered surface.

If a request would have you design something and you have not called `impeccable`, you are not finished — go back and call it.

## Wayfinder and Impeccable are one workflow

[Wayfinder](.claude/skills/wayfinder/SKILL.md) charts *what to decide*. Impeccable decides *how it should look and behave*. They are not alternatives and neither is skipped.

- Every Wayfinder map that touches a user-facing surface states the Impeccable rule in its `## Notes`, naming the sub-command each ticket should use.
- A Wayfinder session resolving a design ticket calls `impeccable` as part of resolving it, alongside `grilling` and `domain-modeling`.
- Where a map carries execution (an override of Wayfinder's plan-only default, stated in its Notes), Impeccable runs **throughout** the build, not just at its edges — see "Implementing a design ticket" below for the four points it is called at and what closes a ticket.
- Impeccable findings that contain a real decision become Wayfinder tickets. Impeccable findings that are pure execution do not need a map — hand them to a polish pass.

### Grilling a design ticket

A `wayfinder:grilling` ticket on a user-facing surface is not a generic conversation. Before the first round of questions, call the Skill tool for `impeccable` alongside `grilling` and `domain-modeling`, and let Impeccable set the agenda:

- **Establish the surface's mode first** — Persuade (landing, marketing, pricing), Operate (app UI, dashboards, editors, settings), Read (docs, articles, changelogs), or Experience (portfolio, gallery). The mode decides which questions matter at all: scanability and native expectations outrank expression on Operate; on Persuade, earning the action is the product.
- **Inspect the incumbent visual truth before asking anything.** Read the components, and look at the running surface where one exists. Questions asked without looking are guesses dressed as a frontier.
- **Put the design dimensions into the rounds as real questions.** Do not settle them silently and do not let them ride along as implementation detail. Sweep: hierarchy and composition · typography and type scale · colour and contrast · spacing and rhythm · motion · UX copy, labels and errors · empty, loading and error states · responsive behaviour · accessibility · cognitive load and decision points · tone (bolder vs. quieter) · design specificity (would a competitor's logo drop straight into this?).
- **Ground every recommended answer in evidence, not taste.** The grilling format requires a `➡️` recommendation on each question; on a design question that recommendation cites the craft floor, detector findings, or the stored critique baseline. "I'd go with the warmer one" is not a recommendation.
- **Close the resolution with an ordered Action Summary of Impeccable commands** — which command addresses which decision, in priority order, ending with `polish` if anything is to be built. The resolution comment on the ticket carries that list so the execution session inherits it.

The command vocabulary to recommend from:

| Command | Use it for |
|---|---|
| `shape` | Plan the UX/UI of a surface before any code |
| `critique` | Design review with heuristic scoring and detector evidence |
| `audit` | Accessibility, performance, responsive correctness |
| `layout` | Spacing, rhythm, visual hierarchy |
| `typeset` | Typography, hierarchy, fonts, type scale |
| `colorize` | Strategic colour in a monochrome UI |
| `clarify` | UX copy, labels, error messages |
| `adapt` | Device and screen-size behaviour |
| `animate` | Purposeful motion |
| `delight` | Personality and memorable touches |
| `bolder` / `quieter` | Amplify a safe design / calm an aggressive one |
| `distill` | Strip to essence, cut complexity |
| `harden` | Errors, i18n, edge cases, production readiness |
| `onboard` | First-run flows, empty states, activation |
| `optimize` | Diagnose and fix UI performance |
| `overdrive` | Push past conventional limits |
| `extract` | Pull reusable tokens and components into the system |
| `document` | Generate DESIGN.md from what shipped |
| `polish` | Final quality pass before shipping |

### Implementing a design ticket

Impeccable is not a planning-phase formality that hands off to an unsupervised build. It has a role at four distinct points of every implementation, and skipping the later three is the common failure — the skill gets called once at the start, the build runs for an hour, and nothing checks what actually landed.

**1. Before the first line of code.** Load the skill with the command the resolution's Action Summary names (a build almost always opens with `shape` for anything new, or the specific `layout`/`typeset`/`clarify` command for a narrow refinement). Run `impeccable context` once per session. Then read `craft-floor.md` — before the first edit, not after the first draft. A planning session skips `craft-floor.md`; an implementing session never does.

**2. During the build, per edit.** The design detector hook fires on every Edit/Write to a UI file and pushes findings back into the session. Treat a finding the way you would a failing test: fix it, or persist the narrowest justified ignore with the evidence named in `--reason`. Never add an ignore to push a write through. If the hook is not firing, you are building blind — say so rather than continuing quietly.

**3. After the surface renders, before claiming done.** Verify with the detector, never by eye. The static scan alone is not enough: on this repo's marketing site `impeccable detect --json` returned 5 findings, all false positives, while the in-page `detect.js` overlay against the running dev server returned 172 real ones. Run the browser overlay for anything viewable. Record before/after counts on the ticket.

**4. The closing pass.** End with `polish`, and with `audit` for anything that changed responsive behaviour, contrast, or focus order. Impeccable's own guidance caps this: build fully, inspect once in a batched round covering desktop and mobile together, fix everything it shows in one batch, confirm with at most one more round, then stop. Bounded passes, not an open-ended self-QA loop.

**What a ticket's definition of done means.** On a map that carries execution, "done" is not "the code compiles and the page looks right." It is: the Action Summary's commands were actually run, the detector was run in-browser, before/after counts are on the ticket, and `polish` closed it out. A ticket closed without those is closed early.

**Findings split two ways.** A finding that contains a real decision — one where a reasonable person could pick either way, or that contradicts a decision already on a map — becomes a Wayfinder ticket rather than a silent fix during the build. A finding that is pure execution is fixed in place and needs no map.

Design decisions already made live on the maps; check them before re-deciding anything:

- [Map: Multi-page marketing site redesign + SEO](https://github.com/petrose99/docubite/issues/126) — IA, visual direction, design tokens, per-page content outlines, pricing, SEO.
- [Map: Marketing site craft floor](https://github.com/petrose99/docubite/issues/142) — legibility, contrast, layout integrity. Carries execution.

Critique snapshots are archived in `.impeccable/critique/` and are the baseline any re-run is measured against.

## Repo orientation

The folder name says "Taxhacker"; the product is **DocuBite** — document inbox, AI extraction, accounting sheets. Read `CONTEXT.md` first. Tracker conventions are in `docs/agents/issue-tracker.md`.

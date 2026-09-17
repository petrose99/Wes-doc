# DocuBite — project instructions

## Design work goes through Intent and Impeccable

**No design decision or UI change in this project is made without consulting both the `intent` skill and the `impeccable` skill.** This is not advisory and it is not scoped to one effort — it holds for every session, every map, every ticket, and every ad-hoc request that touches a user-facing surface.

The two split one job. **Intent decides *why, what and how it behaves*** — who the user is, what they are trying to do, the flow, the information architecture, the interaction and its feedback, the words, every state outside the happy path, and whether the design is honest. **Impeccable decides *how it renders*** — hierarchy, layout, type, colour, spacing, the visual form of motion, responsive rendering, and the craft floor, verified by the detector. Motion sits on the seam: Intent decides that feedback exists and what it must convey; Impeccable decides how it is animated. A decision that skipped Intent is unreasoned; one that skipped Impeccable is unfinished. Neither substitutes for the other.

"Design work" means any of: visual design, layout, spacing, typography, colour, motion, component structure, information architecture, user flows, UX copy, empty/error/loading states, responsive behaviour, or accessibility of a rendered surface. It covers both the marketing site (`app/(marketing)`, `components/marketing`) and the authenticated app (`app/app`, `components/**`).

How to comply:

1. **Call the Skill tool with `intent` before the work starts.** Route to the Intent skill that matches the request — `strategize`, `investigate`, `blueprint`, `journey`, `organize`, `wireframe`, `articulate`, `evaluate`, `fortify`, `include`, `transpose`, `localize`, `measure`, `philosopher`, `specify`. Establish project context once per session (users, product, constraints, ethical stance, success); say what is assumed where context is missing.
2. **Call the Skill tool with `impeccable` before the work starts**, not after it is written. Route to the sub-command that matches the request — `critique`, `audit`, `shape`, `layout`, `typeset`, `clarify`, `polish`, `adapt`, `harden`, `distill`, `bolder`, `quieter`, `animate`, `colorize`, `delight`, `onboard`, `optimize`, `overdrive`, `extract`, `document`.
   *Continuation sessions* (a ticket's hand-off file exists and its Action Summary already names the skills): the routers ran at spec — load the **named** Intent skill and Impeccable sub-command directly and read `craft-floor.md`; do not reload `intent`/`impeccable` from the top. The routers cost ~15K tokens a session and were the second-largest item in the budget that lost #286 two build sessions.
3. **Read `craft-floor.md` before the first UI edit**, including small refinements. The skill points at it; it carries the quality floor and the absolute bans.
4. **Check every decision against the Intent anti-pattern catalog.** A finding there is a defect, named by category and severity, never a trade-off.
5. **Verify with the detector, not by eye.** `impeccable detect --json <targets>` for a static scan, plus the in-page `detect.js` overlay against a running dev server for anything viewable — the static scan alone misses almost everything (on this repo's marketing site it returned 5 findings, all false positives, while the in-page overlay returned 172 real ones).
6. **Record before/after counts** on any ticket that changes a rendered surface.

If a request would have you design something and you have not called both `intent` and `impeccable`, you are not finished — go back and call them.

## Wayfinder, Intent and Impeccable are one workflow

[Wayfinder](.claude/skills/wayfinder/SKILL.md) charts *what to decide*. Intent decides *why, what, and how the experience behaves*. Impeccable decides *how it renders*. They are not alternatives and none is skipped.

- Every Wayfinder map that touches a user-facing surface states the Intent and Impeccable rules in its `## Notes`, naming the Intent skill and the Impeccable sub-command each ticket should use.
- A Wayfinder session resolving a design ticket calls `intent` and `impeccable` as part of resolving it, alongside `grilling` and `domain-modeling`.
- Where a map carries execution (an override of Wayfinder's plan-only default, stated in its Notes), both run **throughout** the build, not just at its edges — see "Implementing a design ticket" below for the four points they are called at and what closes a ticket.
- Intent and Impeccable findings that contain a real decision become Wayfinder tickets. Findings that are pure execution do not need a map — hand them to a polish pass.
- The Intent loop budget applies to the map: at most two backward transitions per effort (a resolution that reopens a closed decision). A third is a mis-scoped map — surface it, don't churn.

### Grilling a design ticket

A `wayfinder:grilling` ticket on a user-facing surface is not a generic conversation. Before the first round of questions, call the Skill tool for `intent` and `impeccable` alongside `grilling` and `domain-modeling`. Intent sets the agenda for the *experience* rounds (user, flow, behaviour, words, states); Impeccable sets it for the *rendering* rounds. Intent's rounds come first: a surface is not shaped until the user, the task and the flow are settled.

Intent's agenda:

- **Establish context before the first question** — who uses this surface, by behaviour not demographics; what they are trying to accomplish; the constraints they act under (time, device, stress, familiarity); the ethical stance in play. Where context is missing, name the assumption on the ticket rather than fill it silently.
- **Put the Intent dimensions into the rounds as real questions.** Sweep: the user's goal and how they solve it today · the flow end-to-end, including before and after the screen · information architecture and labels · UX copy, voice and error messages · the state inventory (empty, loading, error, partial, offline) · autonomy and reversibility of every action · accessibility beyond contrast · what success looks like and how it would be measured · anti-pattern exposure.
- **Ground every recommended answer in a principle or evidence, not taste.** The `➡️` recommendation on an Intent question names the principle it comes from (autonomy, real conditions, visible intent, evidence, systems, ethical defaults), the research it rests on, or the catalog entry it avoids.

Impeccable's agenda:

- **Establish the surface's mode first** — Persuade (landing, marketing, pricing), Operate (app UI, dashboards, editors, settings), Read (docs, articles, changelogs), or Experience (portfolio, gallery). The mode decides which questions matter at all: scanability and native expectations outrank expression on Operate; on Persuade, earning the action is the product.
- **Inspect the incumbent visual truth before asking anything.** Read the components, and look at the running surface where one exists. Questions asked without looking are guesses dressed as a frontier.
- **Put the design dimensions into the rounds as real questions.** Do not settle them silently and do not let them ride along as implementation detail. Sweep: hierarchy and composition · typography and type scale · colour and contrast · spacing and rhythm · motion · UX copy, labels and errors · empty, loading and error states · responsive behaviour · accessibility · cognitive load and decision points · tone (bolder vs. quieter) · design specificity (would a competitor's logo drop straight into this?).
- **Ground every recommended answer in evidence, not taste.** The grilling format requires a `➡️` recommendation on each question; on a design question that recommendation cites the craft floor, detector findings, or the stored critique baseline. "I'd go with the warmer one" is not a recommendation.

**Close the resolution with an ordered Action Summary** — Intent skills first (which skill settles which decision), then Impeccable commands in priority order, ending with `polish` if anything is to be built. The resolution comment on the ticket carries that list so the execution session inherits it.

The Intent skills to recommend from:

| Skill | Use it for |
|---|---|
| `strategize` | Frame the problem, size it, define the hypothesis, scope in/out |
| `investigate` | Plan or synthesise user research a decision waits on |
| `blueprint` | Map the system behind the surface: services, data, dependencies |
| `journey` | Design the flow end-to-end, task sequences, navigation |
| `organize` | Information architecture, taxonomy, labels, findability |
| `wireframe` | Screen structure at wireframe fidelity, before visual design |
| `articulate` | UX copy, voice and tone, error messages, terminology |
| `evaluate` | Heuristic evaluation, anti-pattern detection, scored UX health |
| `fortify` | State inventory, error recovery, edge cases, real-world chaos |
| `include` | Accessibility as a design discipline: screen reader, keyboard, cognitive, motor |
| `transpose` | Reconceive for another platform or device context |
| `localize` | Cultural and language adaptation beyond translation |
| `measure` | Success metrics, counter-metrics, experiments |
| `philosopher` | Sit with a misframed or stuck problem before solving it |
| `specify` | Engineering handoff: specs, copy matrices, test plans, ethical sign-off |

The Impeccable commands to recommend from:

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

Neither Intent nor Impeccable is a planning-phase formality that hands off to an unsupervised build. Each has a role at four distinct points of every implementation, and skipping the later three is the common failure — the skills get called once at the start, the build runs for an hour, and nothing checks what actually landed.

**1. Before the first line of code.** Load `intent` with the skill the resolution's Action Summary names (`specify` when a decided design needs a precise spec; `journey`/`articulate`/`fortify` for a narrow refinement of flow, copy or states). Then load `impeccable` with the command the Action Summary names (a build almost always opens with `shape` for anything new, or the specific `layout`/`typeset`/`clarify` command for a narrow refinement). Run `impeccable context` once per session. Then read `craft-floor.md` — before the first edit, not after the first draft. A planning session skips `craft-floor.md`; an implementing session never does.

**2. During the build, per edit.** The design detector hook fires on every Edit/Write to a UI file and pushes findings back into the session. Treat a finding the way you would a failing test: fix it, or persist the narrowest justified ignore with the evidence named in `--reason`. Never add an ignore to push a write through. If the hook is not firing, you are building blind — say so rather than continuing quietly. Intent has no hook; its per-edit check is the state inventory from `fortify` — every state the spec names (empty, loading, error, partial) exists in code before the happy path is called done.

**3. After the surface renders, before claiming done.** Verify with the detector, never by eye. The static scan alone is not enough: on this repo's marketing site `impeccable detect --json` returned 5 findings, all false positives, while the in-page `detect.js` overlay against the running dev server returned 172 real ones. Run the browser overlay for anything viewable. Record before/after counts on the ticket. Then run `evaluate` against the rendered surface: the heuristic score and any anti-pattern findings go on the ticket beside the detector counts.

**4. The closing pass.** End with `polish`, and with `audit` for anything that changed responsive behaviour, contrast, or focus order; end with `include` for anything that changed keyboard flow, focus order or announced content. Impeccable's own guidance caps this: build fully, inspect once in a batched round covering desktop and mobile together, fix everything it shows in one batch, confirm with at most one more round, then stop. Bounded passes, not an open-ended self-QA loop.

**What a ticket's definition of done means.** On a map that carries execution, "done" is not "the code compiles and the page looks right." It is: the Action Summary's Intent skills and Impeccable commands were actually run, the detector was run in-browser, before/after counts and the `evaluate` score are on the ticket, and `polish` closed it out. A ticket closed without those is closed early.

**The scores are the work list, not the record.** The skills exist to show where the surface is lacking so it gets fixed — a ticket does not close on a bad score with the findings written down beside it. The bar for closing a ticket that changed a rendered surface: every `critique` heuristic at 3/4 or better and every `evaluate` heuristic at 1 or better (`evaluate` counts issues, so lower is better), every real in-page detector finding cleared, and the `evaluate` health score at 80 or above. A heuristic that falls short is worked in the session until it clears. The only findings that may stay open at close are those that contain a real decision (next paragraph) — and each of those is on a ticket, named on the close, with the score it costs; a finding without a decision behind it is never parked. Impeccable's bounded passes still apply *within* a fix batch (build fully, inspect once, fix everything shown, confirm once); they cap the number of inspection rounds, not the number of findings fixed. If the bar cannot be reached inside the ticket's session, the ticket stays open and says why — it is not closed early.

**Findings split two ways.** A finding that contains a real decision — one where a reasonable person could pick either way, or that contradicts a decision already on a map — becomes a Wayfinder ticket rather than a silent fix during the build. A finding that is pure execution is fixed in place and needs no map.

Design decisions already made live on the maps; check them before re-deciding anything:

- [Map: Multi-page marketing site redesign + SEO](https://github.com/petrose99/docubite/issues/126) — IA, visual direction, design tokens, per-page content outlines, pricing, SEO.
- [Map: Marketing site craft floor](https://github.com/petrose99/docubite/issues/142) — legibility, contrast, layout integrity. Carries execution.

Critique snapshots are archived in `.impeccable/critique/` and are the baseline any re-run is measured against.

## Repo orientation

The folder name says "Taxhacker"; the product is **DocuBite** — document inbox, AI extraction, accounting sheets. Read `CONTEXT.md` first. Tracker conventions are in `docs/agents/issue-tracker.md`.

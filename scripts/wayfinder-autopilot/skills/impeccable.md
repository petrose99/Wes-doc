# impeccable — autopilot digest of /home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/SKILL.md. Full skill: read that path by range if a section you need is missing here.

## Setup

1. Run `<skill-base-dir>/scripts/impeccable context` once per session, where `<skill-base-dir>` is the directory that contains this SKILL.md (the skill folder, not a plugin root two levels above it); keep cwd at the user's project. That base directory resolves every `.claude/skills/impeccable/scripts/impeccable <verb>` command in this skill and its references, and `.claude/skills/impeccable/scripts` is the fallback only when the runtime reports no base directory. On a Windows shell without `sh`, call `.claude/skills/impeccable/scripts/impeccable.cmd` instead. The launcher runs a self-contained binary that ships next to it or is downloaded once on first run; no Node or other runtime is required. Pass a named source file or route as `--target <path>`. It loads PRODUCT.md, DESIGN.md, the matching surface brief, and native-platform guidance when applicable; follow its directives and do not rerun it.
2. Load the request's playbook: its Commands-table reference for an explicit/implied sub-command, or [reference/new-work.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/new-work.md) for a new surface or replacement visual world. Inspect target and incumbent visual truth before editing. When the app cannot run, start with committed visual-regression goldens or screenshot fixtures; verify target and freshness against current tokens, CSS, components, or assets, resolve conflicts, and compare theme/variant captures.
3. After resolving analysis and direction, read [reference/craft-floor.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/craft-floor.md) immediately before any UI edit, including small refinements. It carries the quality floor, the absolute bans, and the reflexes no detector catches. Do not load it for planning-only work.

**Launcher unavailable:** On refusal or failure, send a separate message **before the next tool call**: "Context loading did not run; I'll read the existing project context directly." Then read existing PRODUCT.md and DESIGN.md without inventing missing context, follow applicable steps 2–3, and continue through permitted tools. This applies to planning and editing; launcher failure alone does not block either.

## How to design

- **The brief wins.** Honor pinned aesthetics, eras, materials, fonts, and palettes even when they conflict with a saturated-pattern warning. Redirecting a clear brief toward your taste is failure.
- **Refinement preserves; redesign replaces.** Refinement keeps the incumbent identity, behavior, copy, and everything outside scope. Ask before replacing factual copy or adding claims. Redesign keeps product truth, content, function, native affordances, and constraints, but treats the old look as evidence and anti-reference; choose a replacement world in new-work and replace DESIGN.md. Never split the difference into polish on the discarded look.
- **Visual authority is evidence, not a filename.** Missing DESIGN.md alone does not make a project greenfield; new-work decides whether to preserve, expand, or replace the incumbent world.

## Modes

The mode names what the visitor's success looks like on this surface.

- **Persuade:** the visitor decides and acts; design is the product. Landing pages, marketing, campaigns, pricing. Earn attention and action. Ship real imagery when the brief needs it; follow the committed world, not category habit.
- **Operate:** the visitor completes a task. App UI, dashboards, editors, admin, settings, tools. Scanability, consistency, native expectations, and the real usage scene outrank expression. Brand lives in precise details.
- **Read:** the visitor understands something. Docs, articles, guides, help, changelogs. Structure for comprehension, then make the reading experience worth staying in.
- **Experience:** the visitor is inside the work itself. Portfolios, galleries, showcases. Let the artifact lead from the first viewport; the interface recedes.

Choose the mode from the requested surface, not the product, and persist it only in that surface brief. A tool's landing page is still Persuade; a fashion house's documentation is still Read; a docs index is Read, not Persuade. See [new-work.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/new-work.md) for new surfaces and [operate.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/operate.md) for deeper Operate/Read guidance.

## Commands

| Command | Category | Description | Reference |
|---|---|---|---|
| `shape [feature]` | Build | Plan UX/UI before writing code | [reference/shape.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/shape.md) |
| `critique [target]` | Evaluate | UX design review with heuristic scoring | [reference/critique.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/critique.md) |
| `audit [target]` | Evaluate | Technical quality checks (a11y, perf, responsive) | [reference/audit.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/audit.md) · native: [reference/audit.native.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/audit.native.md) |
| `polish [target]` | Refine | Final quality pass before shipping | [reference/polish.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/polish.md) |
| `bolder [target]` | Refine | Amplify safe or bland designs | [reference/bolder.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/bolder.md) |
| `quieter [target]` | Refine | Tone down aggressive or overstimulating designs | [reference/quieter.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/quieter.md) |
| `distill [target]` | Refine | Strip to essence, remove complexity | [reference/distill.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/distill.md) |
| `harden [target]` | Refine | Production-ready: errors, i18n, edge cases | [reference/harden.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/harden.md) |
| `onboard [target]` | Refine | Design first-run flows, empty states, activation | [reference/onboard.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/onboard.md) |
| `animate [target]` | Enhance | Add purposeful animations and motion | [reference/animate.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/animate.md) |
| `colorize [target]` | Enhance | Add strategic color to monochromatic UIs | [reference/colorize.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/colorize.md) |
| `typeset [target]` | Enhance | Improve typography hierarchy and fonts | [reference/typeset.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/typeset.md) |
| `layout [target]` | Enhance | Fix spacing, rhythm, and visual hierarchy | [reference/layout.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/layout.md) |
| `delight [target]` | Enhance | Add personality and memorable touches | [reference/delight.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/delight.md) |
| `overdrive [target]` | Enhance | Push past conventional limits | [reference/overdrive.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/overdrive.md) |
| `clarify [target]` | Fix | Improve UX copy, labels, and error messages | [reference/clarify.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/clarify.md) |
| `adapt [target]` | Fix | Adapt for different devices and screen sizes | [reference/adapt.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/adapt.md) · native: [reference/adapt.native.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/adapt.native.md) |
| `optimize [target]` | Fix | Diagnose and fix UI performance | [reference/optimize.md](/home/ubuntu/Dev/Wes-doc/.claude/skills/impeccable/reference/optimize.md) |

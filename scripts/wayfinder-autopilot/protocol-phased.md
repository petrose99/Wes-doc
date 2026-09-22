# Wayfinder protocol — the parts a phased session uses

The full protocol is `.claude/skills/wayfinder/SKILL.md`; open it by range only if this session charts, graduates fog or rules something out of scope (rare in a build phase; the close phase does it for findings that become tickets).

**Plan vs do.** This map carries execution (its Notes say so); otherwise Wayfinder produces decisions. **Refer by name**: in anything the human reads, a ticket is its linked title, never a bare `#42`.

**The map** is one issue (`wayfinder:map`); its body is the low-res view — Destination, Notes, Decisions so far (one line per closed ticket), Not yet specified (fog), Out of scope. Tickets are child issues with a `## Question`; a session **claims** one by assigning itself first; blocking is the tracker's native dependency; the frontier is open + unblocked + unclaimed.

**Working a ticket:** claim → resolve (zoom into related tickets on demand; read the skill files the map's Notes and the phase brief name) → resolution comment → close → append one line to the map's Decisions so far → create-then-wire any ticket the answer surfaced; graduate fog it sharpened (remove the patch from Not yet specified); rule out of scope anything past the destination (close it, one line under Out of scope). One ticket per session.

**Continuing across sessions.** A ticket that outgrows a session is continued, never narrowed or split for budget. The hand-off at `docs/wayfinder-reports/<map>/<ticket>.handoff.md` carries `milestone:` lines and the `step:` plan; a build session builds the first `todo` step, checks it, marks it `done`, commits, stops. Ending short: post `Autopilot: continue — <where it stands>`, leave it open, commit. Starting: read the hand-off first, then the last commits; never re-spec, rebuild or re-measure what it records as done; re-run the checks the bar requires at close. Splitting is a scoping act only, at a boundary the map would ticket, child blocked on this one. Never delegate the build to a background agent and end the turn waiting.

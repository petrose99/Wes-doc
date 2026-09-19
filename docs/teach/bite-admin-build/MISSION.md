# Mission: What Bite built — the Organization / Company / Admin layer

## Why
Bite (the Wayfinder autopilot) shipped the Companies, Users and Admin Dashboard surfaces on map #226 while you were watching the run log, and the model behind them — organization above company, roles per company, one org-admin flag — went past faster than you could follow. You need it back in your head so you can judge each resolution before Bite builds on it, and walk a client or teammate through the admin area without hesitating.

## Success looks like
- Say, unprompted, what Organization, Company, Owner/Reviewer/Member and Organization admin each mean and which one opens a company.
- Open Admin › Companies / Users / Dashboard in the running app, predict what each shows for a given person before it renders, and be right.
- Read a #226 ticket resolution on one of these surfaces and name one decision you would push back on, with the reason.
- Explain to a client in two sentences why belonging to an organization does not open its companies.

## Constraints
- Product level: what the user sees, the vocabulary, the reason for each decision, with file paths to look at; not data-flow or component internals.
- Short lessons between autopilot runs, under ten minutes each, quizzed.
- Grounded in this repo: CONTEXT.md, the ADRs, the #226 reports and the code as it is now — never from memory.

## Out of scope
- Server-action and Prisma internals (unless a decision cannot be understood without one).
- The document queues, approvals and posting flows Bite built before Companies.
- The autopilot's own mechanics and token bill (see `docs/teach/token-usage/`).

*Set from the working session on 2026-09-19; tell the teacher if any line is wrong.*

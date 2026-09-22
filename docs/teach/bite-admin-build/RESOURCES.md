# Bite admin-build Resources

## Knowledge

- [CONTEXT.md — product glossary](../../../CONTEXT.md)
  The canonical words: Organization, Role, Organization admin, Admin. Use for: any "what is this called and why" question; it is the source every lesson quotes.
- [ADR 0002 — Organization above workspace; workspace is the company](../../adr/0002-organization-above-workspace-workspace-is-the-company.md)
  Why `organizationId` grants nothing and `WorkspaceMember` is the only access grant. Use for: the "belonging opens nothing" rule.
- [ADR 0003 — Claimant is a payee; bank details on the membership](../../adr/0003-claimant-is-a-payee-bank-details-on-the-membership.md)
  Why bank details sit on the per-company membership, never on the person. Use for: the Users pane's bank section.
- [Ticket #300 report — the vocabulary decision](../../wayfinder-reports/226/300.md)
  Two axes, not two ladders; no "workspace" on screen; one admin vocabulary. Use for: the reasoning behind every label.
- [Ticket #285 report — Companies](../../wayfinder-reports/226/285.md), [#286 — Users](../../wayfinder-reports/226/286.md), [#287 — Dashboard and switcher](../../wayfinder-reports/226/287.md)
  What each surface shows, the states, the decisions. Use for: per-surface lessons; check against the code, the reports sometimes describe what was intended.
- [`lib/workspace-groups.ts`](../../../lib/workspace-groups.ts)
  The one function that decides switcher/picker order. Use for: "why is Personal at the bottom".

## Wisdom (Communities)

- [GitHub issue #301](https://github.com/petrose99/Wes-doc/issues/301) — the open execution ticket that folds the #300 words onto the screens. Use for: seeing which decided words are not yet rendered, and pushing back on Bite's plan before it runs.
- No external community applies; the "real world" here is a client walkthrough on the tunnel URL. Report how it went and it becomes a learning record.

## Gaps

- No primary source yet on how the Admin › Dashboard rollups are meant to be read by an accountant (which column they act on first); the #287 report assumes it.

# Incident tabletops and post-mortems

One file per exercise or real incident, using
[incident-template.md](incident-template.md). Files are named
`<YYYY>-<MM>-<short-slug>.md` — e.g. `2026-10-crossword-drill.md`.

## Cadence

- **Annual tabletop:** minimum one per year, ideally two (one for a technical scenario, one for
  a privacy / notification scenario). Track in
  [roles-raci.md](../roles-raci.md) DETECT / RESPOND rows.
- **Follow-up rehearsals:** after every real SEV-1 or SEV-2, run a small rehearsal of the fix.

## Planned exercises

| Date | Scenario | Lead | Notes |
|---|---|---|---|
| 2026-Q4 | Cross-workspace data leak from a missing scope filter (paper drill) | `<TBD-security-owner>` | First tabletop after the CSF gap assessment |
| 2027-Q2 | LLM provider compromised, retention policy triggered | `<TBD-privacy-owner>` | Tests breach-notification-matrix.md |

Both are placeholders until the incident commander is named — see
[roles-raci.md](../roles-raci.md).

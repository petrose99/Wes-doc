# Incident: <one-line description>

- **Severity:** SEV-<n>
- **Declared at:** YYYY-MM-DDThh:mm:ssZ
- **Resolved at:** YYYY-MM-DDThh:mm:ssZ
- **Incident commander:** <name>
- **Recorder:** <name>
- **Roles engaged:** ops lead, comms lead, legal/privacy, exec (as applicable)

## What happened

<Two or three paragraphs. Non-technical enough that the accountable exec can read it, technical
enough that the ops lead's decisions are reproducible.>

## Timeline (UTC)

| Time | Event | Source |
|---|---|---|
| hh:mm | Detected by <alert / customer / staff> | <CloudTrail / GuardDuty / ticket #> |
| hh:mm | IC declared SEV-<n> | chat |
| hh:mm | Mitigation applied: <what> | commit / infra change |
| hh:mm | External notification sent to <recipients> | audit |
| hh:mm | Recovery verified | probe |

## Root cause

<Single paragraph. If the true root cause is a chain of contributory causes, list them.>

## Data affected

- **Data classes:** <e.g. extracted values, credentials> (see
  [../registers/data-inventory.csv](../registers/data-inventory.csv)).
- **Approximate records / subjects:** <n>
- **Jurisdictions:** <list — feeds breach-notification-matrix.md>

## Notifications

| Recipient | Legal basis | Sent | Notes |
|---|---|---|---|
| <regulator> | <e.g. GDPR Art. 33> | YYYY-MM-DD | link to sent notification |
| <customers> | <contract> | YYYY-MM-DD | template used |

## Corrective actions

| # | Action | Owner | Due | Status |
|---|---|---|---|---|
| CA-1 | | | | |
| CA-2 | | | | |

## Lessons

- What worked.
- What did not.
- What we would do differently.

## Evidence links

- <log excerpt / snapshot ARN / audit-archive path>

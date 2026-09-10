# Named-role RACI for NIST CSF 2.0 functions

R = Responsible (does the work), A = Accountable (single owner of the outcome), C = Consulted,
I = Informed.

The four named roles below map to the placeholders used throughout the security documentation
(`<TBD-accountable-exec>`, `<TBD-security-owner>`, `<TBD-privacy-owner>`, `<TBD-incident-commander>`,
`<TBD-system-owner>`). Filling in names here is the single edit that propagates to
[POLICY-SET.md](POLICY-SET.md), the risk register, and the incident-response plan by
find-and-replace.

| Role | Placeholder | Person | Backup |
|------|-------------|--------|--------|
| Accountable executive | `<TBD-accountable-exec>` | `<TBD>` | `<TBD>` |
| Security owner | `<TBD-security-owner>` | `<TBD>` | `<TBD>` |
| Privacy / data-protection owner | `<TBD-privacy-owner>` | `<TBD>` | `<TBD>` |
| Incident commander (rotating) | `<TBD-incident-commander>` | `<TBD>` | `<TBD>` |
| System owner (DocuBite production) | `<TBD-system-owner>` | `<TBD>` | `<TBD>` |

Roles are held by people, not teams. If a person holds more than one role, that is fine — the
RACI still needs the name recorded per row so an audit can see the concentration.

## Function-by-function RACI

### GOVERN
| Activity | Exec | Security owner | Privacy owner | System owner | IC |
|---|---|---|---|---|---|
| Approve policy set (annual) | **A** | R | C | I | I |
| Approve risk-acceptance | **A** | R | C | C | I |
| Vendor / DPA sign-off | **A** | C | R | I | I |
| Named-role RACI (this doc) | **A** | R | C | C | C |

### IDENTIFY
| Activity | Exec | Security owner | Privacy owner | System owner | IC |
|---|---|---|---|---|---|
| Asset inventory (Terraform + SaaS) | I | C | I | **A**/R | I |
| Risk register | I | **A**/R | C | C | C |
| Data inventory | I | C | **A**/R | C | I |
| Supplier register + DPAs | I | C | **A**/R | I | I |
| STRIDE threat model | I | **A** | C | R | C |

### PROTECT
| Activity | Exec | Security owner | Privacy owner | System owner | IC |
|---|---|---|---|---|---|
| Access reviews (quarterly) | I | **A**/R | C | R | I |
| MFA on admin + `BREAK_GLASS_ADMIN_EMAIL` | I | **A** | I | R | I |
| Malware scan enforcement | I | **A** | I | R | I |
| Row-level security policies + `DB_RLS_ENABLED=true` | I | **A** | I | R | I |
| Secret management + rotation | I | **A** | I | R | I |

### DETECT
| Activity | Exec | Security owner | Privacy owner | System owner | IC |
|---|---|---|---|---|---|
| Log ingestion + retention | I | **A** | C | R | I |
| GuardDuty / CloudTrail / Config alerts | I | **A** | I | R | I |
| Weekly review of alert quality | I | **A**/R | I | C | C |

### RESPOND
| Activity | Exec | Security owner | Privacy owner | System owner | IC |
|---|---|---|---|---|---|
| Declare an incident | I | C | C | C | **A**/R |
| External / regulator notification | **A** | C | R | I | R |
| Post-incident review + fixes | I | C | I | R | **A** |
| Tabletop exercise (annual) | I | **A** | C | R | R |

### RECOVER
| Activity | Exec | Security owner | Privacy owner | System owner | IC |
|---|---|---|---|---|---|
| Backup + restore drills | I | C | I | **A**/R | I |
| RTO / RPO decisions | **A** | C | C | R | I |
| Communications during recovery | **A** | C | R | I | R |

## Framework mapping

Closes the "GV.RR / RACI" gap flagged by the 2026-09-10 NIST CSF 2.0 gap assessment. The RACI is
the repo-side half; naming the actual people is the human-decision half.

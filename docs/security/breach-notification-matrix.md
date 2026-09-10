# Breach-notification decision matrix

Closes RS.CO-02 (notifications from response processes are consistent with the requirements of
each affected jurisdiction).

Every row is a jurisdiction we are exposed to via customers or workforce. When an incident is
declared, the incident commander walks this matrix top-to-bottom, ticks the ones that apply,
and hands each triggered row to the privacy owner for the notification itself. Templates live
under [templates/notifications/](templates/notifications/).

| Jurisdiction | Legal basis | Trigger | Clock (from awareness) | Recipients | Content template |
|---|---|---|---|---|---|
| EU / EEA | GDPR Art. 33 / 34 | Personal data breach likely to result in a risk to rights & freedoms | 72h (regulator); without undue delay (data subjects, when high risk) | Lead supervisory authority (identify via one-stop-shop); affected data subjects if high risk | [templates/notifications/gdpr-authority.md](templates/notifications/gdpr-authority.md) |
| UK | UK GDPR + DPA 2018 | Same as EU | 72h (ICO); as EU for data subjects | ICO; affected data subjects | [templates/notifications/ukgdpr-ico.md](templates/notifications/ukgdpr-ico.md) |
| US HIPAA | 45 CFR §164.400-414 | Breach of unsecured PHI | 60 days (individuals + HHS if ≥500); annual roll-up (HHS if <500) | Affected individuals; HHS OCR; prominent media if ≥500 in a state | [templates/notifications/hipaa-individual.md](templates/notifications/hipaa-individual.md) |
| US - California | CCPA / CPRA + Civ. Code §1798.82 | Unencrypted personal info acquired by unauthorized person | Most expedient time; ≥500 CA residents ⇒ AG | Affected residents; California AG if ≥500 | [templates/notifications/ca-1798.82.md](templates/notifications/ca-1798.82.md) |
| US - Texas | Bus. & Com. Code §521.053 | Sensitive personal information acquired | 30 days; AG if ≥250 | Affected residents; Texas AG if ≥250 | [templates/notifications/generic-us-state.md](templates/notifications/generic-us-state.md) |
| US - Virginia | Code of Va. §18.2-186.6 | Same conceptual test | Without unreasonable delay; AG if ≥1000 | Affected residents; Virginia AG if ≥1000 | [templates/notifications/generic-us-state.md](templates/notifications/generic-us-state.md) |
| US - Colorado | C.R.S. §6-1-716 | Same | 30 days; AG if ≥500 | Affected residents; Colorado AG if ≥500 | [templates/notifications/generic-us-state.md](templates/notifications/generic-us-state.md) |
| US - Connecticut | Conn. Gen. Stat. §36a-701b | Same | 60 days | Affected residents; state AG | [templates/notifications/generic-us-state.md](templates/notifications/generic-us-state.md) |
| US - Utah | Utah Code §13-44-202 | Same | Without unreasonable delay | Affected residents | [templates/notifications/generic-us-state.md](templates/notifications/generic-us-state.md) |
| EU DSA | Reg. (EU) 2022/2065 Art. 18 | Suspicion of criminal offence involving threat to life or safety | Promptly | Law enforcement of the affected Member State | Legal counsel drafts case-by-case |
| US FTC (breach) | 16 CFR §318 (health app) + FTC Act | Health-app data disclosed without authorization | 60 days after discovery | Affected individuals; FTC; media if ≥500 | [templates/notifications/ftc-health-breach.md](templates/notifications/ftc-health-breach.md) |

## Common decisions before any row is triggered

1. **Was the data actually unsecured?** Encryption-at-rest under a key not in the attacker's
   possession usually removes the trigger. Record the reasoning either way.
2. **Which jurisdictions do the affected data subjects live in?** DocuBite's own workforce is
   `<TBD>`; customer counts per jurisdiction come from the workspace `country` field and the
   invoice records.
3. **Do any contractual notice obligations shorten a statutory clock?** Read the customer MSA
   and the DPA for each affected customer before starting the clock.
4. **Which supplier's actions caused the breach, if any?** Their DPA sets an incoming-notice
   clock (see [registers/supplier-register.csv](registers/supplier-register.csv)).

## Templates folder

Each template file above is a starter. Legal / privacy counsel review is required before any
notification goes out; the templates capture required content elements to save that review time,
not to bypass it.

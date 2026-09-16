## Question

Execution of #231 (Admin area), part 1 of 3. Build on `codex/post-login-ux-implementation`.

**Decided on #231 — do not re-decide:** decisions 9–13 (IA), 20–27 (rendering). Read the resolution comment on #231 and `docs/adr/0002-organization-above-workspace-workspace-is-the-company.md`; glossary: Admin, Configuration, Company.

Scope:
- Rail: bottom item **Admin** replaces Settings; **Controls leaves the primary spine** (its pages move — nothing is removed); `/automation/*` and `/settings/*` 308-redirect to their Admin homes. Rail collapses to the 56px icon rail on Admin.
- Admin shell: left nav with two captioned groups — ORGANIZATION (Dashboard · Companies · Users — links only; the screens ship on the part-3 ticket, until then Users = this company's members table relocated) and ‹COMPANY NAME› (Configuration · Approval Flows · PO Mismatch Flows · Suppliers · Integrations).
- **Configuration**: per-type field table (canonical keys from `lib/doc-types.ts` + that type's `DocumentTemplate` custom fields; Editable · Required · Width; ✕ on custom rows only) driving the Detail pane and each queue's system-view default columns (decision 11); autonomy ladder, what blocks a publish, policy, amount bands (from Controls › Settings); warn checks (label "When", reference rewritten); AI extraction; email intake; **Tax** (was Jurisdiction); "What's on" (Modules, stale Worksheets/Dictation rows hidden as unplugged). Member-not-owner sees Configuration read-only with "Ask an owner" instead of `notFound()`.
- **Suppliers**: `settings/rules` and Controls › Vendors merged into one page.
- **Integrations** (+ Account mapping), section absent when integrations are off.
- Account menu gains Security (moved from `settings/security`) and Reset tour; phone 4th tab becomes **Account**; Admin pages render content-only on a phone with the one-line "Admin is a desktop area" note.
- Templates and Reports stay reachable as sections under Configuration until the owner signs the unplug ticket.
- Primitives: `extract` the `#e6ebf1`/`#f1f5f9`/`#dbe3ec` hairlines into tokens; `Panel`/`Ledger`/`SettingToggle`, `font-display` 26px h1, one `max-w`; `Card` retired from Admin; inline `SettingToggle` gets a visible explanation; pill contrast ≥4.5:1; both nav landmarks named.
- Save + Discard on a sticky bottom bar with the unsaved marker and `beforeunload`.

Close bar (CLAUDE.md): `intent` (`specify`, `fortify`, `include`) and `impeccable` (`extract`, `shape`, `layout`, `distill`, `clarify`, `adapt`, `audit`, `polish`) run at the four points; in-page detector before/after at 1440 and 390 for Configuration, Suppliers and the Admin landing (baseline: settings/workspace 10/9, settings/modules 11/8, Controls settings 10/5 — five of each shell-level); critique ≥28/40 (baseline 23/40); `evaluate` ≥80.

---
status: accepted
---

# The Workspace is the Company; an Organization groups Workspaces above it, and never grants access to them

DocuBite needs Vic.ai's "one login, many companies" Admin (Companies, an organization-wide Users list, per-entity roles) on map #226 (#231). The research on #230 found that a Workspace already carries everything an entity needs — country, currency, timezone, fiscal year, tax jurisdiction, VAT scheme, matching tolerance, HIPAA posture, its own suppliers and one Bigcapital ledger organization (ADR-001) — that 71 of 80 models are keyed on `workspaceId`, and that both isolation layers (the Prisma scope guard and Postgres RLS) key on `workspace_id`. We decided that **the Workspace is the Company** (shown as "Company" in Admin and the switcher, "Personal" for the auto-created one), that an additive **Organization** (`Workspace.organizationId` nullable, plus an `OrganizationMember` join carrying `admin | member`) groups companies for the accountant running several clients, and that **organization membership never implies entity access**: `WorkspaceMember` stays the only grant, and every organization-wide query is written as `unscoped()` with an explicit `workspaceId IN (…)` list derived from `WorkspaceMember` rows, never from `OrganizationMember`.

## Considered options

- **Company below Workspace (Workspace becomes the firm).** Rejected: every entity-level field and 71 `workspaceId` columns would have to move to a new `Company`, both isolation layers re-keyed, and `BigcapitalAccount.workspaceId @unique` (one ledger per entity) would break.
- **Organization membership grants access to all its companies.** Rejected: it would make firm membership a silent cross-tenant widening and make the per-workspace scope guard and RLS insufficient; Vic's own model adds each entity to a user explicitly.
- **No grouping — keep the flat switcher.** Rejected: the accountant configures the same thing per client and has no cross-company users list; that is the gap the research found.

## Consequences

- `WorkspaceMember.role` (`owner | reviewer | member`) stays the per-entity role; `OrganizationMember.role` is `admin | member` and only governs Companies, Users and invitations in Admin. Platform `User.role = "admin"` remains a third, unrelated axis (`lib/admin.ts`).
- Closing the scope-guard gap (32 `workspaceId` models outside `WORKSPACE_SCOPED_MODELS`) is a prerequisite for the first cross-company screen, because a company switcher makes cross-workspace navigation by one user routine.
- Personal workspaces are never members of an organization and never appear in Companies.
- An invitation can name several companies with a role in each; acceptance writes one `WorkspaceMember` row per company.

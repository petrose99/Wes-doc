# Wayfinder research — what the schema and auth already support for multi-company access

Ticket: [Research: what the schema and auth already support for multi-company access (#230)](https://github.com/petrose99/docubite/issues/230)
Map: [Make the operator app work like Vic.ai (#226)](https://github.com/petrose99/docubite/issues/226)
Feeds: [Shape the Admin area (#231)](https://github.com/petrose99/docubite/issues/231)

## Question

Admin will include Companies — one login, many companies, per-entity permissions (Vic.ai: Users → Companies tab, User Type Accountant/Approver plus User Level per entity; `docs/vic-ai-ux-tour-findings.md` §Admin → Users). Establish from the codebase what Workspace, WorkspaceMember and role look like today; whether anything sits above Workspace; how the switcher and `requireWorkspaceRole` scope access; what Supabase auth gives per user; what the tenant-isolation setting assumes; and which models would need an Organization foreign key for a company switcher to work without cross-tenant leaks.

Every claim below is read from the file and line cited, on branch `codex/post-login-ux-implementation` at commit `f8d3079`. Nothing is from memory.

## Summary

1. **Workspace is already the company.** It carries country, base currency, timezone, fiscal-year start, jurisdiction pack, HIPAA mode, one auto-provisioned Bigcapital ledger organization (`BigcapitalAccount.workspaceId @unique`), its own suppliers, chart-of-accounts sync, approval workflows and budgets. 71 of the 80 Prisma models carry a `workspaceId` column. Nothing above Workspace exists — no Organization, Firm, Tenant or Company model — and the schema itself defers it: "One jurisdiction per workspace for now; multi-entity graduates to a future decision" (`prisma/schema.prisma:123-124`).
2. **"One login, many companies" already works at the data level.** `WorkspaceMember` is a User↔Workspace join with a per-row `role` (`prisma/schema.prisma:221-233`), so one User can hold different roles in different workspaces today, and the sidebar switcher lists every workspace the user is a member of (`app/(app)/workspaces/[workspaceId]/layout.tsx:23-24,48`). What is missing is the *grouping*: no way to say "these five workspaces belong to one firm", no firm-level user list, no firm-level invite, and no firm-level admin.
3. **Isolation is per-workspace and must stay that way.** Both isolation layers — the Prisma scope guard (`lib/workspace-scope.ts`) and Postgres RLS (`app_current_workspace()` in `prisma/migrations/20260819190000_add_row_level_security/migration.sql`) — key on `workspace_id`. An Organization layer should therefore be *additive* (a nullable `organizationId` on Workspace plus an `OrganizationMember` join), not a re-keying of the 71 scoped models. Cross-tenant risk from a company switcher is zero as long as every page keeps resolving access through `getWorkspaceMembership(workspaceId, userId)`; the risk arrives only if organization membership is ever allowed to *imply* workspace access without a `WorkspaceMember` row.

## Current model

### User (`prisma/schema.prisma:16-87`)

- `id` is a local uuid; `supabaseUserId` (nullable, unique) links it to `auth.users.id` in the Supabase project (`:18-24`). The two ids are deliberately different values so the "11 FK relations to User" survived the auth migration (`:22-23`).
- `role String @default("user")` — `"user"` or `"admin"`, a **platform** role, deliberately a string not an enum: "the set grows by data, not by migration" (`:28-31`). `lib/admin.ts:5-7` is explicit that this is "not a workspace role": `WorkspaceMember.role` is "a different axis entirely — a platform admin is usually a plain member of nothing". `isAdmin` gates only `/admin-next` (`lib/admin.ts:17-35`) and the BAA console action (`app/admin-next/baa/actions.ts:16`).
- `suspendedAt` is the account-wide kill switch, enforced once in `getViewerUser` (`lib/auth.ts:55-85`).

### Workspace (`prisma/schema.prisma:89-219`)

Fields that make a Workspace a legal/financial entity rather than a folder:

| Field | Line | Meaning |
|---|---|---|
| `kind` | 92-95 | `"personal"` (auto-created, one per user) or `"team"` |
| `industry` | 96-98 | always `"finance"` now |
| `country`, `baseCurrency`, `timezone`, `fiscalYearStart` | 99-102 | entity-level accounting settings |
| `hipaaMode`, `asrExternalAllowed` | 104-113 | compliance posture per workspace |
| `inboundEmailToken` | 114-120 | per-workspace inbound address |
| `jurisdictionCode`, `jurisdictionPackVersion` | 121-130 | one tax jurisdiction per workspace; "multi-entity graduates to a future decision" (`:123-124`) |
| `deferredVatScheme` | 131-138 | per-entity VAT enrolment |
| `poQuantityTolerancePercent` | 139-143 | per-entity matching tolerance |

Workspace has 70 relation arrays (`:146-216`) — everything from documents and suppliers to approval workflows, budgets, payment runs, closes and the Bigcapital ledger account. ADR-001 (`docs/architecture/adr-001-bigcapital-is-the-ledger.md`) makes "one Bigcapital organization per workspace" the ledger design, and `BigcapitalAccount.workspaceId` is `@unique` (`prisma/schema.prisma`, model `BigcapitalAccount`). **A Workspace therefore already maps 1:1 onto Vic's "Company/Entity."**

### WorkspaceMember (`prisma/schema.prisma:221-233`)

```prisma
model WorkspaceMember {
  id          String    @id @default(uuid()) @db.Uuid
  workspaceId String    @map("workspace_id") @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  role        String    @default("member")
  ...
  @@unique([workspaceId, userId])
}
```

- `role` is a free string in the schema; the application narrows it to `WorkspaceRole = "owner" | "reviewer" | "member"` (`models/workspaces.ts:18`) and `parseRole` collapses anything else to `"member"` (`:25`).
- One row per (workspace, user), so a user's role is **already per-entity** — the Vic "User Level per entity" shape at the storage layer. A user who is `owner` of workspace A and `member` of workspace B is expressible today.
- Workspace **mode** (`"firm" | "smb"`) is *derived*, not stored: firm iff at least one member holds `reviewer` (`models/workspaces.ts:35-46`, decision #41). This is the closest thing to an "accounting firm" concept and it lives inside one workspace, not above it.
- `WorkspaceInvitation` (`:235-250`) is also per-workspace: email + role + token, sent by an owner (`createWorkspaceInvitation` requires `["owner"]`, `models/workspaces.ts:350-351`). There is no "invite to the firm" path.

### What sits above Workspace

Nothing. `grep -i "organi[sz]ation|company|tenant|firm"` over `prisma/schema.prisma` finds only: Bigcapital's remote `organizationId` on `BigcapitalAccount` (an external ledger id, `:1233-1248`), an integration's `externalTenantId`/`tenantName` (Xero/QuickBooks tenant, `:1167-1168`), FxRate's note that "rates aren't tenant data" (`:2571`), and the `firm`/`smb` mode strings. `docs/architecture` holds one ADR (Bigcapital), and no ADR or research note describes a tenancy layer above Workspace.

The "personal" workspace is the only implicit grouping: `getOrCreateWorkspaceForUser` and `/workspaces` land the user in `memberships[0]` (`models/workspaces.ts:142-145`; `app/(app)/workspaces/page.tsx:22-27`). There is no workspace picker page — "There is no workspace picker — this route resolves the user's workspace and forwards" (`app/(app)/workspaces/page.tsx:6-7`).

## Access scoping

### The switcher (`components/workspace/switcher.tsx`)

A client `Popover` that renders `workspaces: SwitchableWorkspace[]` as plain `Link`s to `/workspaces/${id}` plus a "New workspace" link (`:8, :32-40, :43-47`). It does **no** access work of its own; it lists whatever the layout hands it, which is `getWorkspacesForUser(user.id)` — `prisma.workspace.findMany({ where: { members: { some: { userId } } } })` (`models/workspaces.ts:136-140`), mapped to `{ id, name, kind, role }` (`layout.tsx:48`). So the switcher is already a "companies I belong to" list, keyed by membership rows, ordered by creation date, with no grouping and no firm header. The `role` field is passed but not rendered (`switcher.tsx:8` declares it; the JSX never reads it).

Any member may create a new team workspace (`app/(app)/workspaces/[workspaceId]/workspace-actions.ts:41-47`; `models/workspaces.ts:131-134` "there is no plan gate on creating one anymore"), and the creator becomes its sole `owner` (`createWorkspaceForUser`, `:115`).

### `requireWorkspaceRole` (`models/workspaces.ts:152-156`)

```ts
export async function requireWorkspaceRole(workspaceId: string, userId: string, allowed: WorkspaceRole[] = ["owner", "reviewer", "member"]) {
  const membership = await getWorkspaceMembership(workspaceId, userId)
  if (!membership || !allowed.includes(membership.role as WorkspaceRole)) throw new Error("workspace_access_denied")
  return membership
}
```

- Scope is exactly one `(workspaceId, userId)` membership row, read via `getWorkspaceMembership` (`:147-150`, React-`cache()`d per request, with the workspace included).
- 79 call sites across `app`, `lib`, `models`. Where a literal role list is passed, 17 restrict to `["owner"]` and 1 to all three; the rest use the default (any member) or a `roles` variable via the action wrapper `requireMember` (`app/(app)/workspaces/[workspaceId]/action-helpers.ts:73-79`), which converts the throw into a null so actions can return `NO_ACCESS`.
- The workspace layout is the page-level gate: `getWorkspaceMembership(workspaceId, user.id)`, non-members are redirected to `/workspaces` (`layout.tsx:23-24`). `hipaaMode` additionally demands an `aal2` session (`:26-42`).
- `reviewer` is consulted as a capability in a handful of places — close locking (`lib/close/actions.ts:62-68, 207-220`), saved views (`lib/saved-views.ts`, `models/saved-views.ts`), the members table and invite form — 24 non-test references in total.

**Conclusion:** access is a two-level ladder, platform `User.role` (admin console only) above per-workspace `WorkspaceMember.role`. Nothing evaluates a role across workspaces, and nothing can grant access to a workspace other than a `WorkspaceMember` row (invitation acceptance upserts exactly one, `models/workspaces.ts:403-440`).

## Auth

### What Supabase gives per user

- `getSession` (`lib/auth.ts:25-35`) verifies the JWT locally with `supabase.auth.getClaims()` and returns `{ user: { id: sub, email, name }, aal }`. The `sub`, `email`, `user_metadata.name` and `aal` claims are the **entire** identity surface the app reads. No `app_metadata`, no custom claims, no tenant claim: `grep app_metadata|custom_access_token` over `lib`, `app`, `models` finds nothing. The only auth hook is the signup-allowed hook (`app/api/internal/auth/signup-allowed/route.ts`, secret at `lib/config.ts:38,380`), which gates *who may register*, not what they may see.
- `getViewerUser` (`lib/auth.ts:70-85`) turns that into the local `User` row via `resolveOrProvisionUser` (`models/users.ts:26-58`) — link by `supabaseUserId`, else by email, else create — and refuses suspended rows. `role` is read from Postgres on every request, never from the JWT (`lib/auth.ts:48-50`).
- `lib/supabase/middleware.ts` refreshes the session and enforces an app-level idle timeout; `proxy.ts` only checks that *a* session exists for `/workspaces` and `/admin-next` (`proxy.ts:22, 32-35`) and explicitly leaves the Prisma-side role check to the page (`:58-62`).
- `createAdminClient` (service role) exists only for migration/seed scripts (`lib/supabase/server.ts:28-37`; `lib/config.ts:375-379`).
- The Supabase project is "Auth-only and holds no application tables" (`lib/config.ts:375-377`). Supabase RLS is therefore irrelevant to tenant isolation here; Postgres RLS on *this* database is what matters (next section).

**Implication for Companies:** Supabase contributes identity only. Company membership, entity roles and any "current company" selection will live in this app's Postgres and be resolved per request exactly as `WorkspaceMember` is now. Putting an organization or company list into JWT claims would need a custom access-token hook and would reintroduce the stale-claims problem `lib/auth.ts:48-50` avoids on purpose.

### Dev bypass

`DEV_AUTH_BYPASS` substitutes a fixed identity (`lib/supabase/dev-bypass.ts`) and can never be on under `NODE_ENV=production` (`lib/config.ts:371-373`). Not relevant to the design, but any multi-company seed data needs to give that fixed user memberships in more than one workspace to exercise the switcher locally.

## Isolation

`config.isolation` (`lib/config.ts:382-390`) has two switches:

```ts
isolation: {
  scopeGuard: env.DB_SCOPE_GUARD ?? (process.env.NODE_ENV === "production" ? "throw" : "warn"),
  rlsEnabled: env.DB_RLS_ENABLED === "true",
},
```

### Layer 1 — Prisma scope guard (`lib/workspace-scope.ts`, wired in `lib/db.ts:48-75`)

- Assumption, stated at the top of the file: "Isolation in this app is app-level: every query is expected to carry `where: { workspaceId }`" (`lib/workspace-scope.ts:3-4`).
- `WORKSPACE_SCOPED_MODELS` lists **39** models. Any `findMany/count/updateMany/...` against one of them without a `workspaceId` filter (directly, in AND/OR/NOT, or via a scoped relation — `hasWorkspaceFilter`) throws in production and warns in dev. Unique-key operations are exempt. 19 call sites wrap legitimately global queries in `unscoped()`.
- `verifyProductionConfig` refuses to boot production unless `scopeGuard === "throw"` (`lib/verify-production-config.ts:10-16`).
- Deliberately unlisted: `User`, `Workspace`, `WorkspaceMember`, `WorkspaceInvitation` ("membership is how workspace access is *decided*, so it must be readable before a workspace is known"), `AdminAuditEvent`, `ProductEvent`, and child models reached only through a scoped parent (`lib/workspace-scope.ts:15-21`; `prisma/schema.prisma` ProductEvent comment).
- **Gap worth recording:** 71 models carry a `workspaceId` column but only 39 are in the guard set. The 32 outside it include several first-class operator models — `Supplier`, `SupplierAlias`, `PaymentRun`, `PaymentRunItem`, `Close`, `CloseItem`, `Gate`, `WarnCheck`, `AuditEvent`, `SavedView`, `HealthScore`, `InboundEmailIntake`, `GoldenDocument`, `Institution`, `CategoryAccountMapping` (full list from diffing the set against the schema: WorkspaceMember, WorkspaceInvitation, FieldSuggestion, DocumentSheetPlacement, AuditEvent, Gate, WarnCheck, BigcapitalAccount, BigcapitalMemberAccount, IntegrationProvisionJob, HealthCheckResult, HealthScore, HealthScoreConfig, ProductEvent, CodingCorrection, CategoryAccountMapping, CategoryNature, UserListPreference, SavedView, PaymentRun, PaymentRunItem, Supplier, SupplierAlias, InboundEmailIntake, BankMatchMemory, GoldenDocument, ReviewerActivity, SupplierMergeEvent, SupplierMatchLabel, Close, CloseItem, Institution). Some are intentionally global; most look like omissions as new models were added. A company switcher raises the stakes on this because it makes cross-workspace navigation by the *same user* routine rather than rare.

### Layer 2 — Postgres RLS (`lib/db-rls.ts`, migrations `20260819190000`, `20260822010000`, `20260906150000`)

- Mechanism: every policy is `USING ("workspace_id" = app_current_workspace()) WITH CHECK (...)`, where `app_current_workspace()` reads `current_setting('app.workspace_id', true)`; unset scope yields NULL and **fails closed** (`20260819190000/migration.sql:9-12, 19-21`). The app sets it per transaction with `SET LOCAL` via `withWorkspace(workspaceId, tx => ...)` (`lib/db-rls.ts:27-37`).
- 27 distinct `*_workspace_isolation` policies exist across migrations; 19 tables have `ENABLE`+`FORCE ROW LEVEL SECURITY`. `tests/security/cross-tenant.db.test.ts:73-104` probes that every scoped table has RLS enabled and forced and that a wrong session scope returns zero rows.
- **Status:** `DB_RLS_ENABLED` defaults off, and `withWorkspace(` has **zero** non-test call sites in `lib`, `models`, `app`. The migration warns "DO NOT set DB_RLS_ENABLED=true in production until withWorkspace() has been adopted across the read/write paths" (`20260822010000/migration.sql:21-24`). So RLS is installed machinery, not an active control; the scope guard is the control that is live.

### What the setting assumes, in one line

Both layers assume **the tenant is the Workspace and one request touches one workspace**. Neither has a concept of "a set of workspaces this user may see at once." An Organization-level screen (Vic's Admin Dashboard "Open Invoices Per Entity", Users list across companies) is by construction a multi-workspace query: under the scope guard it must run inside `unscoped()` with an explicit `workspaceId: { in: [...memberWorkspaceIds] }` filter; under RLS it would need one transaction per workspace or a second, organization-keyed policy. That is the isolation decision the grilling ticket has to take.

## What an Organization layer needs

Counting from the schema: **80 models; 71 carry `workspaceId`; 1 of those is nullable (`ProductEvent`); 9 have none** (`User`, `Workspace`, `AdminAuditEvent`, `AuthRateLimit`, `DocumentFileShare`, `DocumentTemplateVersion`, `FxRate`, `Subprocessor`, `TaxProfileVersion`).

Two ways to introduce a company switcher:

### Option A — Workspace *is* the Company; add Organization above it (additive)

Models that need an Organization foreign key: **two**, plus one new join.

| Change | Why |
|---|---|
| `Organization { id, name, ... }` (new) | The firm / customer account. |
| `Workspace.organizationId String? @db.Uuid` (new FK, nullable) | Groups companies. Nullable so every existing personal/team workspace keeps working ungrouped; backfill later. |
| `OrganizationMember { organizationId, userId, role }` (new join) | Firm-level users list, firm-level roles (Vic's "User Type" Accountant/Approver). |
| `WorkspaceMember` (unchanged) | Stays the *only* thing that grants entity access and carries the per-entity level (Vic's "User Level"). |
| `WorkspaceInvitation` (optionally + `organizationId`) | So an invite can seed memberships in several companies at once. |

The 71 `workspaceId` models are **not** touched; both isolation layers keep working unchanged because access still resolves through `(workspaceId, userId)`. This is the option the schema comment at `prisma/schema.prisma:123-124` and ADR-001's org-per-workspace ledger already point at.

Organization-scoped queries (dashboard rollups, cross-company user list) are the new class that must be written as `unscoped()` + `workspaceId: { in: memberWorkspaceIds }`, where `memberWorkspaceIds` is derived from `WorkspaceMember`, never from `OrganizationMember` — otherwise firm membership silently becomes access to every company in the firm, which is exactly the leak the ticket asks to avoid.

### Option B — Workspace becomes the Organization; add Company *below* it

Every entity-level fact currently on Workspace (country, currency, timezone, fiscal year, jurisdiction, VAT scheme, PO tolerance, HIPAA mode, inbound email token, Bigcapital account) would move to a new `Company`, and **the 71 `workspaceId` models would each need a `companyId`** for suppliers, documents, approvals, closes, ledgers and budgets to be per-entity. Both isolation layers would have to be re-keyed (39-model guard set, 27 RLS policies, `app_current_workspace()`), and `BigcapitalAccount.workspaceId @unique` would break ADR-001's one-ledger-per-entity design. This is the expensive path and the evidence does not support it.

### Either way, the switcher needs

- A "current company" that is already the URL segment `/workspaces/[workspaceId]` — no session state required (`layout.tsx:19-24`).
- The list grouped by organization (today: flat, creation-ordered, `getWorkspacesForUser`).
- `role` rendered per entry (the field is passed but unused, `switcher.tsx:8`).
- `/workspaces` to become a real picker or firm home when a user has more than one membership (today it forwards to `memberships[0]`, `app/(app)/workspaces/page.tsx:22-27`).

## Open decisions for the grilling ticket (#231)

1. **Company = Workspace (Option A) or Company below Workspace (Option B)?** Evidence favours A: 71 models keyed on `workspaceId`, one Bigcapital org per workspace, jurisdiction and currency already per workspace, both isolation layers keyed on `workspace_id`.
2. **Does firm (Organization) membership ever imply entity access?** Vic's model says no — each entity is added to a user explicitly with its own remove button (`docs/vic-ai-ux-tour-findings.md:36`). Recommending no: keep `WorkspaceMember` as the sole grant so the scope guard and RLS remain sufficient.
3. **Two role axes or one?** Vic has User Type (Accountant/Approver) *and* User Level per entity. Today DocuBite has `owner | reviewer | member` per workspace and a derived firm/smb mode (#41). Decide whether User Type lives on `OrganizationMember`, on `WorkspaceMember`, or is dropped in favour of the existing three roles plus `ReviewRoutingRule`/`ApprovalWorkflowStage` assignment.
4. **What happens to `kind: "personal"`?** Every user gets one on first visit (`/workspaces/new`); a firm accountant with ten client companies would also own a personal workspace that appears in the switcher. Hide it, retire it, or make it the firm's default company.
5. **Cross-company queries and isolation.** Admin Dashboard per-entity rollups and the firm Users list are multi-workspace by definition. Decide the rule: `unscoped()` + explicit `workspaceId IN (memberships)` under the scope guard, and whether RLS gets an organization-aware policy or stays per-workspace with one transaction per entity. Also decide whether closing the 32-model guard-set gap is a prerequisite.
6. **Invitations.** Per-workspace today (`createWorkspaceInvitation` requires owner of that workspace). Decide whether a firm admin can invite a user into N companies in one action, and which role in each.
7. **Where does platform `User.role = "admin"` sit** relative to an organization admin? Today it only unlocks `/admin-next` (`lib/admin.ts`); it should not become a firm super-role by accident.
8. **Switcher and `/workspaces` behaviour** with many companies: grouped popover vs. Vic's top-left entity dropdown; whether `/workspaces` becomes the firm home; how the icon rail and #113's mobile navigation expose Admin. (Design decisions — `impeccable shape` per the map's Notes.)

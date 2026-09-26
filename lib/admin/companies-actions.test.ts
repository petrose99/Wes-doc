import { beforeEach, describe, expect, it, vi } from "vitest"

// #285 spec §2 gating rule (under lib/ because vitest include does not cover app/), one branch per action: owner / non-owner / cross-organization.
// Everything below the actions is mocked at the module boundary — no database.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", email: "u1@example.com" }) }))
vi.mock("@/lib/db", () => ({ prisma: { workspace: { findUnique: vi.fn(), findFirst: vi.fn() } } }))
vi.mock("@/lib/workspace-scope", () => ({ unscoped: (fn: () => unknown) => fn() }))
vi.mock("@/models/workspaces", () => ({ getWorkspaceMembership: vi.fn() }))
vi.mock("@/models/company-currency", () => ({
  changeCompanyCurrency: vi.fn(),
  countUnpostedDocuments: vi.fn().mockResolvedValue(0),
  getCurrencyLock: vi.fn().mockResolvedValue({ locked: false }),
}))
vi.mock("@/models/organizations", () => ({
  addCompanyToOrganization: vi.fn(),
  createOrganization: vi.fn(),
  listOrganizationsForUser: vi.fn().mockResolvedValue([]),
  moveWorkspaceIntoOrganization: vi.fn(),
  removeWorkspaceFromOrganization: vi.fn(),
}))

const actions = await import("@/app/(app)/workspaces/[workspaceId]/admin/companies/actions")
const { prisma } = await import("@/lib/db")
const { getWorkspaceMembership } = await import("@/models/workspaces")
const orgs = await import("@/models/organizations")
const { revalidatePath } = await import("next/cache")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
const membership = getWorkspaceMembership as unknown as ReturnType<typeof vi.fn>

const ROUTE = { id: "ws-a", name: "Acme Advisory", kind: "team", organizationId: "org-1", country: "US", baseCurrency: "USD" }
const SIBLING = { id: "ws-b", name: "Riverside Bakery Co.", kind: "team", organizationId: "org-1" }
const UNGROUPED = { id: "ws-c", name: "Free Agent Ltd", kind: "team", organizationId: null }
const FOREIGN = { id: "ws-d", name: "Other Org Co", kind: "team", organizationId: "org-2" }
const PERSONAL = { id: "ws-p", name: "Personal", kind: "personal", organizationId: null }
const HEADS: Record<string, unknown> = { [ROUTE.id]: ROUTE, [SIBLING.id]: SIBLING, [UNGROUPED.id]: UNGROUPED, [FOREIGN.id]: FOREIGN, [PERSONAL.id]: PERSONAL }

/** `roles` = the caller's WorkspaceMember role per workspace id; missing = not a member. */
function seed(roles: Record<string, "owner" | "reviewer" | "member">) {
  db.workspace.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => HEADS[where.id] ?? null)
  membership.mockImplementation(async (workspaceId: string) => (roles[workspaceId] ? { role: roles[workspaceId], workspaceId } : null))
}

beforeEach(() => {
  vi.clearAllMocks()
  db.workspace.findFirst.mockResolvedValue(null)
  ;(orgs.listOrganizationsForUser as ReturnType<typeof vi.fn>).mockResolvedValue([])
})

describe("loadCompanyDetailAction", () => {
  it("returns the row for any member of the target, with the viewer's role", async () => {
    seed({ [ROUTE.id]: "owner", [SIBLING.id]: "reviewer" })
    db.workspace.findFirst.mockResolvedValue({ ...SIBLING, country: "US", baseCurrency: "USD", jurisdictionCode: null, createdAt: new Date("2026-01-01"), _count: { members: 3 }, members: [{ user: { name: "Ada Owner", email: "ada@example.com" } }] })
    const result = await actions.loadCompanyDetailAction(ROUTE.id, SIBLING.id)
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ id: SIBLING.id, viewerRole: "reviewer", memberCount: 3, isCurrent: false, owners: ["Ada Owner"] })
  })

  it("not_found when the viewer has no membership on the target", async () => {
    seed({ [ROUTE.id]: "owner" })
    expect(await actions.loadCompanyDetailAction(ROUTE.id, SIBLING.id)).toEqual({ success: false, error: "not_found" })
    expect(db.workspace.findFirst).not.toHaveBeenCalled()
  })

  it("not_in_organization when the route workspace is ungrouped", async () => {
    seed({ [UNGROUPED.id]: "owner" })
    expect(await actions.loadCompanyDetailAction(UNGROUPED.id, SIBLING.id)).toEqual({ success: false, error: "not_in_organization" })
  })
})

describe("createOrganizationAction", () => {
  it("owner of an ungrouped team workspace: creates and moves the workspace in", async () => {
    seed({ [UNGROUPED.id]: "owner" })
    ;(orgs.createOrganization as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "org-new", name: "Free Agent Group" })
    const result = await actions.createOrganizationAction(UNGROUPED.id, { name: "  Free  Agent Group " })
    expect(result).toEqual({ success: true, data: { organizationId: "org-new", name: "Free Agent Group" } })
    expect(orgs.createOrganization).toHaveBeenCalledWith("Free Agent Group", "u1")
    expect(orgs.moveWorkspaceIntoOrganization).toHaveBeenCalledWith(UNGROUPED.id, "org-new", "u1")
    expect(revalidatePath).toHaveBeenCalled()
  })

  it("non-owner: owner_required, nothing created", async () => {
    seed({ [UNGROUPED.id]: "member" })
    expect(await actions.createOrganizationAction(UNGROUPED.id, { name: "X" })).toEqual({ success: false, error: "owner_required" })
    expect(orgs.createOrganization).not.toHaveBeenCalled()
  })

  it("already grouped / personal / name taken / empty name each refuse by code", async () => {
    seed({ [ROUTE.id]: "owner", [PERSONAL.id]: "owner", [UNGROUPED.id]: "owner" })
    expect((await actions.createOrganizationAction(ROUTE.id, { name: "X" })).error).toBe("already_grouped")
    expect((await actions.createOrganizationAction(PERSONAL.id, { name: "X" })).error).toBe("personal_workspace")
    expect((await actions.createOrganizationAction(UNGROUPED.id, { name: "   " })).error).toBe("name_required")
    ;(orgs.listOrganizationsForUser as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "org-1", name: "acme advisory" }])
    expect((await actions.createOrganizationAction(UNGROUPED.id, { name: "Acme Advisory" })).error).toBe("name_taken")
    expect(orgs.createOrganization).not.toHaveBeenCalled()
  })
})

describe("addCompanyAction", () => {
  it("owner of the route workspace: adds into its organization with the route's defaults", async () => {
    seed({ [ROUTE.id]: "owner" })
    ;(orgs.addCompanyToOrganization as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "ws-new", name: "New Co" })
    const result = await actions.addCompanyAction(ROUTE.id, { name: "New Co" })
    expect(result).toEqual({ success: true, data: { workspaceId: "ws-new", name: "New Co" } })
    expect(orgs.addCompanyToOrganization).toHaveBeenCalledWith("org-1", "u1", { name: "New Co", country: "US", baseCurrency: "USD" })
  })

  it("reviewer of the route workspace: owner_required", async () => {
    seed({ [ROUTE.id]: "reviewer" })
    expect(await actions.addCompanyAction(ROUTE.id, { name: "New Co" })).toEqual({ success: false, error: "owner_required" })
    expect(orgs.addCompanyToOrganization).not.toHaveBeenCalled()
  })

  it("ungrouped route workspace: not_in_organization; duplicate name in the org: name_taken", async () => {
    seed({ [UNGROUPED.id]: "owner", [ROUTE.id]: "owner" })
    expect((await actions.addCompanyAction(UNGROUPED.id, { name: "New Co" })).error).toBe("not_in_organization")
    db.workspace.findFirst.mockResolvedValue({ id: SIBLING.id })
    expect((await actions.addCompanyAction(ROUTE.id, { name: "riverside bakery co." })).error).toBe("name_taken")
    expect(orgs.addCompanyToOrganization).not.toHaveBeenCalled()
  })
})

describe("moveCompanyIntoOrganizationAction", () => {
  it("owner of both route and target, target ungrouped: moves", async () => {
    seed({ [ROUTE.id]: "owner", [UNGROUPED.id]: "owner" })
    const result = await actions.moveCompanyIntoOrganizationAction(ROUTE.id, UNGROUPED.id)
    expect(result).toEqual({ success: true, data: { workspaceId: UNGROUPED.id, name: UNGROUPED.name } })
    expect(orgs.moveWorkspaceIntoOrganization).toHaveBeenCalledWith(UNGROUPED.id, "org-1", "u1")
  })

  it("owner of the route but not of the target: owner_required", async () => {
    seed({ [ROUTE.id]: "owner", [UNGROUPED.id]: "member" })
    expect(await actions.moveCompanyIntoOrganizationAction(ROUTE.id, UNGROUPED.id)).toEqual({ success: false, error: "owner_required" })
  })

  it("target already in another organization: already_grouped; personal target refused; non-owner route refused", async () => {
    seed({ [ROUTE.id]: "owner", [FOREIGN.id]: "owner", [PERSONAL.id]: "owner", [SIBLING.id]: "member" })
    expect((await actions.moveCompanyIntoOrganizationAction(ROUTE.id, FOREIGN.id)).error).toBe("already_grouped")
    expect((await actions.moveCompanyIntoOrganizationAction(ROUTE.id, PERSONAL.id)).error).toBe("personal_workspace")
    expect((await actions.moveCompanyIntoOrganizationAction(SIBLING.id, UNGROUPED.id)).error).toBe("owner_required")
    expect((await actions.moveCompanyIntoOrganizationAction(ROUTE.id, "ws-missing")).error).toBe("not_found")
    expect(orgs.moveWorkspaceIntoOrganization).not.toHaveBeenCalled()
  })
})

describe("removeCompanyFromOrganizationAction", () => {
  it("owner of the target row, same organization: removes", async () => {
    seed({ [ROUTE.id]: "member", [SIBLING.id]: "owner" })
    const result = await actions.removeCompanyFromOrganizationAction(ROUTE.id, SIBLING.id)
    expect(result).toEqual({ success: true, data: { workspaceId: SIBLING.id, name: SIBLING.name } })
    expect(orgs.removeWorkspaceFromOrganization).toHaveBeenCalledWith(SIBLING.id, "u1")
  })

  it("owner of the route but only a reviewer of the target: owner_required (pane writes gate on the target)", async () => {
    seed({ [ROUTE.id]: "owner", [SIBLING.id]: "reviewer" })
    expect(await actions.removeCompanyFromOrganizationAction(ROUTE.id, SIBLING.id)).toEqual({ success: false, error: "owner_required" })
    expect(orgs.removeWorkspaceFromOrganization).not.toHaveBeenCalled()
  })

  it("cross-organization target: not_in_organization; the current company itself: is_current", async () => {
    seed({ [ROUTE.id]: "owner", [FOREIGN.id]: "owner" })
    expect((await actions.removeCompanyFromOrganizationAction(ROUTE.id, FOREIGN.id)).error).toBe("not_in_organization")
    expect((await actions.removeCompanyFromOrganizationAction(ROUTE.id, ROUTE.id)).error).toBe("is_current")
    expect(orgs.removeWorkspaceFromOrganization).not.toHaveBeenCalled()
  })
})

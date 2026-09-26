import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: {}, PrismaClient: vi.fn() }))

const {
  listOrganizationCompanies,
  listOrganizationUsers,
  countAccessibleCompanies,
  createOrganization,
  addCompanyToOrganization,
  moveWorkspaceIntoOrganization,
  removeWorkspaceFromOrganization,
  listOwnedUngroupedTeamWorkspaces,
  organizationCompanyCount,
} = await import("@/models/organizations")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
})

describe("ADR 0002 — organization membership never grants entity access on its own", () => {
  it("listOrganizationCompanies derives the visible workspace ids from WorkspaceMember, never from OrganizationMember directly", async () => {
    db.workspace = {
      findMany: vi.fn()
        // accessibleWorkspaceIds's own findMany, filtered by members:{some:{userId}}
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    }

    const companies = await listOrganizationCompanies("org1", "stranger-user")

    expect(companies).toEqual([])
    // The very first call the function makes must filter by workspace membership, not by
    // organization membership — if this filter is ever weakened to `organizationId` alone, an
    // OrganizationMember-only user would see every company in the org.
    expect(db.workspace.findMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org1", members: { some: { userId: "stranger-user" } } }) }),
    )
  })

  it("countAccessibleCompanies is zero for a user with only an OrganizationMember row and no WorkspaceMember anywhere", async () => {
    db.workspace = { findMany: vi.fn().mockResolvedValue([]) }

    const count = await countAccessibleCompanies("org1", "stranger-user")

    expect(count).toBe(0)
  })

  it("listOrganizationUsers returns nothing when the caller has no accessible workspace", async () => {
    db.workspace = { findMany: vi.fn().mockResolvedValue([]) }
    db.workspaceMember = { findMany: vi.fn() }

    const users = await listOrganizationUsers("org1", "stranger-user")

    expect(users).toEqual([])
    expect(db.workspaceMember.findMany).not.toHaveBeenCalled()
  })

  it("listOrganizationCompanies scopes the detail query to exactly the accessible ids", async () => {
    db.workspace = {
      findMany: vi.fn()
        .mockResolvedValueOnce([{ id: "w1" }, { id: "w2" }])
        .mockResolvedValueOnce([{ id: "w1", name: "A" }, { id: "w2", name: "B" }]),
    }

    await listOrganizationCompanies("org1", "user1")

    expect(db.workspace.findMany.mock.calls[1][0]).toEqual(
      expect.objectContaining({ where: { id: { in: ["w1", "w2"] } } }),
    )
  })
})

describe("createOrganization", () => {
  it("creates the organization with the founder as an admin OrganizationMember", async () => {
    db.organization = { create: vi.fn().mockResolvedValue({ id: "org1", name: "Acme" }) }

    await createOrganization("  Acme  ", "user1")

    expect(db.organization.create).toHaveBeenCalledWith({
      data: { name: "Acme", members: { create: { userId: "user1", role: "admin" } } },
    })
  })

  it("rejects an empty name", async () => {
    await expect(createOrganization("   ", "user1")).rejects.toThrow("organization_name_required")
  })
})

describe("addCompanyToOrganization", () => {
  it("creates a team workspace inside the organization with the caller as owner", async () => {
    db.workspace = { create: vi.fn().mockResolvedValue({ id: "w1" }) }

    await addCompanyToOrganization("org1", "user1", { name: "New Co" })

    expect(db.workspace.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "New Co",
        kind: "team",
        country: "ZA",
        baseCurrency: "ZAR",
        organizationId: "org1",
        members: { create: { userId: "user1", role: "owner" } },
      }),
    })
  })

  it("refuses an unsupported country or pair and creates nothing", async () => {
    db.workspace = { create: vi.fn() }

    await expect(addCompanyToOrganization("org1", "user1", { name: "US Co", country: "US", baseCurrency: "USD" })).rejects.toThrow("company_country_unsupported")
    await expect(addCompanyToOrganization("org1", "user1", { name: "ZA Co", country: "ZA", baseCurrency: "LSL" })).rejects.toThrow("company_currency_not_allowed")
    expect(db.workspace.create).not.toHaveBeenCalled()
  })
})

describe("moveWorkspaceIntoOrganization", () => {
  it("refuses a caller who is not the workspace owner", async () => {
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue({ role: "member" }) }
    db.workspace = { update: vi.fn() }

    await expect(moveWorkspaceIntoOrganization("w1", "org1", "user1")).rejects.toThrow("workspace_access_denied")
    expect(db.workspace.update).not.toHaveBeenCalled()
  })

  it("allows the owner to attach the workspace to an organization", async () => {
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue({ role: "owner" }) }
    db.workspace = { update: vi.fn().mockResolvedValue({ id: "w1", organizationId: "org1" }) }

    await moveWorkspaceIntoOrganization("w1", "org1", "user1")

    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "w1" }, data: { organizationId: "org1" } })
  })
})

describe("removeWorkspaceFromOrganization", () => {
  it("refuses a caller who is not the workspace owner", async () => {
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue({ role: "member" }) }
    db.workspace = { update: vi.fn() }

    await expect(removeWorkspaceFromOrganization("w1", "user1")).rejects.toThrow("workspace_access_denied")
    expect(db.workspace.update).not.toHaveBeenCalled()
  })

  it("allows the owner to detach the workspace, mirroring moveWorkspaceIntoOrganization", async () => {
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue({ role: "owner" }) }
    db.workspace = { update: vi.fn().mockResolvedValue({ id: "w1", organizationId: null }) }

    await removeWorkspaceFromOrganization("w1", "user1")

    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "w1" }, data: { organizationId: null } })
  })
})

describe("listOwnedUngroupedTeamWorkspaces", () => {
  it("scopes to team workspaces the caller owns with no organization", async () => {
    db.workspaceMember = { findMany: vi.fn().mockResolvedValue([]) }

    await listOwnedUngroupedTeamWorkspaces("user1")

    expect(db.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user1", role: "owner", workspace: { kind: "team", organizationId: null } } }),
    )
  })

  it("sorts the eligible workspaces by name", async () => {
    db.workspaceMember = {
      findMany: vi.fn().mockResolvedValue([
        { workspace: { id: "w2", name: "Zeta Co" } },
        { workspace: { id: "w1", name: "Alpha Co" } },
      ]),
    }

    const rows = await listOwnedUngroupedTeamWorkspaces("user1")

    expect(rows.map((row) => row.id)).toEqual(["w1", "w2"])
  })
})

describe("organizationCompanyCount", () => {
  it("counts every workspace in the organization, not only the caller's accessible ones", async () => {
    db.workspace = { count: vi.fn().mockResolvedValue(5) }

    const count = await organizationCompanyCount("org1")

    expect(count).toBe(5)
    expect(db.workspace.count).toHaveBeenCalledWith({ where: { organizationId: "org1" } })
  })
})

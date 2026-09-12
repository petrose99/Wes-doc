import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: {}, PrismaClient: vi.fn() }))
vi.mock("@/models/bigcapital-members", () => ({ provisionMemberAccount: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/models/files", () => ({ createFile: vi.fn(), deleteFiles: vi.fn() }))
vi.mock("@/lib/document-storage", () => ({ deleteDocumentSource: vi.fn() }))
vi.mock("@/lib/audit-archive", () => ({ archiveWorkspaceAuditEvents: vi.fn().mockResolvedValue({ archived: 0 }) }))

vi.mock("@/lib/gates/smb-ceiling", () => ({
  resolveOpenSmbCeilingGatesForWorkspace: vi.fn().mockResolvedValue(undefined),
  reevaluateOpenSmbCeilingGatesForWorkspace: vi.fn().mockResolvedValue(undefined),
}))

const {
  acceptWorkspaceInvitation,
  createTeamWorkspace,
  createWorkspaceInvitation,
  deleteWorkspace,
  getPendingInvitationForEmail,
  getWorkspaceMode,
  leaveWorkspace,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  transferWorkspaceOwnership,
  updateWorkspaceMemberRole,
} = await import("@/models/workspaces")
const smbCeiling = await import("@/lib/gates/smb-ceiling")
const { prisma } = await import("@/lib/db")
const { deleteFiles, createFile } = await import("@/models/files")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.$transaction = vi.fn(async (operations: unknown[]) => operations)
})

describe("createTeamWorkspace", () => {
  it("creates a team workspace with no plan/seat gate", async () => {
    db.workspace = { create: vi.fn().mockResolvedValue({ id: "w-new", industry: "finance" }) }
    vi.mocked(createFile).mockResolvedValue({ id: "f1" } as never)

    const workspace = await createTeamWorkspace({ id: "u1", name: "A", email: "a@example.com", role: "user" }, "Team")

    expect(workspace).toEqual({ id: "w-new", industry: "finance" })
    expect(db.workspace.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Team", kind: "team", industry: "finance" }),
    }))
  })
})

describe("createWorkspaceInvitation", () => {
  it("creates an invitation with no seat limit to check", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ role: "owner", workspace: {} }),
      findFirst: vi.fn().mockResolvedValue(null),
    }
    db.workspace = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "w1", name: "W" }) }
    db.user = { findUnique: vi.fn().mockResolvedValue({ email: "owner@example.com" }) }
    db.workspaceInvitation = { deleteMany: vi.fn(), create: vi.fn().mockResolvedValue({ id: "i1" }) }

    const result = await createWorkspaceInvitation({ workspaceId: "w1", ownerId: "u1", email: "b@example.com" })

    expect(result.workspaceName).toBe("W")
  })

  it("refuses inviting yourself", async () => {
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue({ role: "owner", workspace: {} }) }
    db.workspace = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "w1", name: "W" }) }
    db.user = { findUnique: vi.fn().mockResolvedValue({ email: "owner@example.com" }) }
    await expect(createWorkspaceInvitation({ workspaceId: "w1", ownerId: "u1", email: "Owner@Example.com" })).rejects.toThrow("self_invite")
  })
})

describe("updateWorkspaceMemberRole", () => {
  it("refuses to demote the only owner", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "owner" }),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn(),
    }
    await expect(updateWorkspaceMemberRole({ workspaceId: "w1", actorId: "u2", memberUserId: "u1", role: "member" })).rejects.toThrow("last_owner_required")
    expect(db.workspaceMember.update).not.toHaveBeenCalled()
  })

  it("demotes an owner once a second owner exists", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "owner" }),
      count: vi.fn().mockResolvedValue(2),
      update: vi.fn().mockReturnValue({ id: "m1", role: "member" }),
    }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await updateWorkspaceMemberRole({ workspaceId: "w1", actorId: "u2", memberUserId: "u1", role: "member" })

    expect(db.workspaceMember.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { role: "member" } })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })

  it("rejects an unknown member", async () => {
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn(), update: vi.fn() }
    await expect(updateWorkspaceMemberRole({ workspaceId: "w1", actorId: "u2", memberUserId: "nobody", role: "owner" })).rejects.toThrow("member_not_found")
  })
})

describe("removeWorkspaceMember", () => {
  it("refuses to remove yourself", async () => {
    await expect(removeWorkspaceMember({ workspaceId: "w1", actorId: "u1", memberUserId: "u1" })).rejects.toThrow("use_leave_workspace")
  })

  it("refuses to remove the last owner", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "owner", user: { email: "a@example.com" } }),
      count: vi.fn().mockResolvedValue(1),
    }
    await expect(removeWorkspaceMember({ workspaceId: "w1", actorId: "u2", memberUserId: "u1" })).rejects.toThrow("last_owner_required")
  })

  it("revokes the removed member's per-email file shares in the same transaction", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "member", user: { email: "B@Example.com" } }),
      count: vi.fn().mockResolvedValue(2),
      delete: vi.fn().mockReturnValue("delete-member"),
    }
    db.documentFileShare = { deleteMany: vi.fn().mockReturnValue("delete-shares") }
    db.workspaceInvitation = { deleteMany: vi.fn().mockReturnValue("delete-invites") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await removeWorkspaceMember({ workspaceId: "w1", actorId: "u2", memberUserId: "u1" })

    expect(db.documentFileShare.deleteMany).toHaveBeenCalledWith({ where: { email: "b@example.com", file: { workspaceId: "w1" } } })
    expect(db.$transaction).toHaveBeenCalledWith(["delete-member", "delete-shares", "delete-invites", "audit"])
  })
})

describe("leaveWorkspace", () => {
  it("refuses a personal workspace", async () => {
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "owner", user: { email: "a@example.com" }, workspace: { kind: "personal" } }) }
    await expect(leaveWorkspace("w1", "u1")).rejects.toThrow("cannot_leave_personal_workspace")
  })

  it("refuses a sole owner who still has team-mates", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "owner", user: { email: "a@example.com" }, workspace: { kind: "team" } }),
      count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(3),
    }
    await expect(leaveWorkspace("w1", "u1")).rejects.toThrow("transfer_ownership_before_leaving")
  })

  it("tells a sole owner who is also the sole member to delete instead", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "owner", user: { email: "a@example.com" }, workspace: { kind: "team" } }),
      count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
    }
    await expect(leaveWorkspace("w1", "u1")).rejects.toThrow("delete_workspace_instead")
  })
})

describe("transferWorkspaceOwnership", () => {
  it("promotes the target and demotes the actor in one transaction", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m2", role: "member" }),
      update: vi.fn((args: unknown) => args),
    }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await transferWorkspaceOwnership({ workspaceId: "w1", actorId: "u1", targetUserId: "u2" })

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.$transaction.mock.calls[0][0]).toEqual([
      { where: { workspaceId_userId: { workspaceId: "w1", userId: "u2" } }, data: { role: "owner" } },
      { where: { workspaceId_userId: { workspaceId: "w1", userId: "u1" } }, data: { role: "member" } },
      "audit",
    ])
  })

  it("refuses transferring to yourself", async () => {
    await expect(transferWorkspaceOwnership({ workspaceId: "w1", actorId: "u1", targetUserId: "u1" })).rejects.toThrow("cannot_transfer_to_self")
  })
})

describe("deleteWorkspace", () => {
  const filePages = (total: number) => {
    let remaining = total
    return vi.fn(async () => {
      const size = Math.min(100, remaining)
      remaining -= size
      return Array.from({ length: size }, (_, index) => ({ id: `f${remaining}-${index}` }))
    })
  }

  it("pages through deleteFiles so blobs past the first 100 are not orphaned", async () => {
    db.documentFile = { findMany: filePages(250) }
    db.document = { findMany: vi.fn().mockResolvedValue([]) }
    db.workspace = { findUnique: vi.fn().mockResolvedValue({ name: "W", kind: "team" }), delete: vi.fn() }
    db.adminAuditEvent = { create: vi.fn() }
    vi.mocked(deleteFiles).mockImplementation(async (_workspaceId, ids) => ({ deleted: ids.length }))

    await deleteWorkspace({ workspaceId: "w1", actorId: "u1" })

    expect(deleteFiles).toHaveBeenCalledTimes(3)
    expect(vi.mocked(deleteFiles).mock.calls.map((call) => call[1].length)).toEqual([100, 100, 50])
    expect(db.workspace.delete).toHaveBeenCalledWith({ where: { id: "w1" } })
  })
})

describe("revokeWorkspaceInvitation", () => {
  it("scopes the delete by workspace as well as invitation id", async () => {
    db.workspaceInvitation = { findFirst: vi.fn().mockResolvedValue({ email: "b@example.com" }), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) }
    db.documentAuditEvent = { create: vi.fn() }
    await revokeWorkspaceInvitation("w1", "i1", "u1")
    expect(db.workspaceInvitation.deleteMany).toHaveBeenCalledWith({ where: { id: "i1", workspaceId: "w1" } })
  })
})

describe("getPendingInvitationForEmail", () => {
  it("normalises the address and filters out accepted and expired rows", async () => {
    db.workspaceInvitation = { findFirst: vi.fn().mockResolvedValue({ id: "i1" }) }
    await getPendingInvitationForEmail("  Someone@Example.COM ")
    const where = db.workspaceInvitation.findFirst.mock.calls[0][0].where
    expect(where.email).toBe("someone@example.com")
    expect(where.acceptedAt).toBeNull()
    expect(where.expiresAt.gt).toBeInstanceOf(Date)
  })

  it("returns null for a blank address without querying", async () => {
    db.workspaceInvitation = { findFirst: vi.fn() }
    expect(await getPendingInvitationForEmail("   ")).toBeNull()
    expect(db.workspaceInvitation.findFirst).not.toHaveBeenCalled()
  })
})

describe("workspace mode derivation (#41)", () => {
  it("is smb when no member holds the reviewer role", async () => {
    db.workspaceMember = { count: vi.fn().mockResolvedValue(0) }
    expect(await getWorkspaceMode("w1")).toBe("smb")
    expect(db.workspaceMember.count).toHaveBeenCalledWith({ where: { workspaceId: "w1", role: "reviewer" } })
  })

  it("is firm when at least one reviewer exists", async () => {
    db.workspaceMember = { count: vi.fn().mockResolvedValue(1) }
    expect(await getWorkspaceMode("w1")).toBe("firm")
  })
})

describe("reviewer audit events (#41)", () => {
  // Turns a mocked-out audit chain into just the events writeAuditEvent-shaped for assertion:
  // every documentAuditEvent.create call arrives with { data: <auditEventData return> }, so the
  // real emissions ride on data.type + data.detail. This mirrors what production writes.
  const auditTypes = () => db.documentAuditEvent.create.mock.calls.map((call: [{ data: { type: string; detail: unknown } }]) => call[0].data.type)
  const auditByType = (type: string) => db.documentAuditEvent.create.mock.calls.find((call: [{ data: { type: string; detail: unknown } }]) => call[0].data.type === type)?.[0].data.detail

  it("emits reviewer.added + mode.changed on smb → firm role change", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "member" }),
      // countOwners is not called (member → reviewer never hits the owner guard) but countReviewers is:
      // 0 reviewers before, +1 delta → mode flips smb → firm.
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockReturnValue({ id: "m1", role: "reviewer" }),
    }
    db.documentAuditEvent = { create: vi.fn((args) => args) }

    await updateWorkspaceMemberRole({ workspaceId: "w1", actorId: "u2", memberUserId: "u1", role: "reviewer" })

    expect(auditTypes()).toEqual(expect.arrayContaining(["workspace_member_role_changed", "workspace.reviewer.added", "workspace.mode.changed"]))
    expect(auditByType("workspace.mode.changed")).toMatchObject({ from: "smb", to: "firm" })
    expect(smbCeiling.resolveOpenSmbCeilingGatesForWorkspace).toHaveBeenCalledWith("w1", "workspace_added_reviewer")
  })

  it("refuses to demote the last reviewer without confirmLastReviewerRemoval", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "reviewer" }),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn(),
    }
    await expect(updateWorkspaceMemberRole({ workspaceId: "w1", actorId: "u2", memberUserId: "u1", role: "member" })).rejects.toThrow("last_reviewer_removal_requires_confirmation")
    expect(db.workspaceMember.update).not.toHaveBeenCalled()
    expect(smbCeiling.reevaluateOpenSmbCeilingGatesForWorkspace).not.toHaveBeenCalled()
  })

  it("demotes the last reviewer once confirmed, emitting the firm → smb mode.changed event", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "reviewer" }),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockReturnValue({ id: "m1", role: "member" }),
    }
    db.documentAuditEvent = { create: vi.fn((args) => args) }

    await updateWorkspaceMemberRole({ workspaceId: "w1", actorId: "u2", memberUserId: "u1", role: "member", confirmLastReviewerRemoval: true })

    expect(auditTypes()).toEqual(expect.arrayContaining(["workspace.reviewer.removed", "workspace.mode.changed"]))
    expect(auditByType("workspace.mode.changed")).toMatchObject({ from: "firm", to: "smb" })
    expect(smbCeiling.reevaluateOpenSmbCeilingGatesForWorkspace).toHaveBeenCalledWith("w1")
  })

  it("keeps mode.changed silent when the reviewer role moves between members", async () => {
    // Two reviewers before, one demoted → reviewer count drops from 2 to 1, still firm mode.
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "reviewer" }),
      count: vi.fn().mockResolvedValue(2),
      update: vi.fn().mockReturnValue({ id: "m1", role: "member" }),
    }
    db.documentAuditEvent = { create: vi.fn((args) => args) }

    await updateWorkspaceMemberRole({ workspaceId: "w1", actorId: "u2", memberUserId: "u1", role: "member" })

    expect(auditTypes()).toContain("workspace.reviewer.removed")
    expect(auditTypes()).not.toContain("workspace.mode.changed")
    expect(smbCeiling.reevaluateOpenSmbCeilingGatesForWorkspace).not.toHaveBeenCalled()
  })

  it("removeWorkspaceMember requires confirmation when the removed member is the last reviewer", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "reviewer", user: { email: "r@example.com" } }),
      count: vi.fn().mockResolvedValue(1),
    }
    await expect(removeWorkspaceMember({ workspaceId: "w1", actorId: "u2", memberUserId: "u1" })).rejects.toThrow("last_reviewer_removal_requires_confirmation")
  })

  it("acceptWorkspaceInvitation as a reviewer emits reviewer.added and fires the mode-flip hook", async () => {
    const future = new Date(Date.now() + 60_000)
    db.workspaceInvitation = { findUnique: vi.fn().mockResolvedValue({ id: "i1", workspaceId: "w1", email: "r@example.com", role: "reviewer", acceptedAt: null, expiresAt: future }), update: vi.fn().mockReturnValue("accept") }
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0), upsert: vi.fn().mockReturnValue("upsert") }
    db.documentAuditEvent = { create: vi.fn((args) => args) }
    db.user = { findUnique: vi.fn().mockResolvedValue({ id: "u1", name: "R", email: "r@example.com" }) }

    await acceptWorkspaceInvitation("token", { id: "u1", email: "r@example.com" })

    expect(auditTypes()).toEqual(expect.arrayContaining(["invitation_accepted", "workspace.reviewer.added", "workspace.mode.changed"]))
    expect(smbCeiling.resolveOpenSmbCeilingGatesForWorkspace).toHaveBeenCalledWith("w1", "workspace_added_reviewer")
  })

  it("transferWorkspaceOwnership promoting the last reviewer demands confirmation", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m2", role: "reviewer" }),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn((args: unknown) => args),
    }
    await expect(transferWorkspaceOwnership({ workspaceId: "w1", actorId: "u1", targetUserId: "u2" })).rejects.toThrow("last_reviewer_removal_requires_confirmation")
  })

  it("leaveWorkspace as the last reviewer demands confirmation", async () => {
    db.workspaceMember = {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "reviewer", user: { email: "r@example.com" }, workspace: { kind: "team" } }),
      count: vi.fn().mockResolvedValue(1),
    }
    await expect(leaveWorkspace("w1", "u1")).rejects.toThrow("last_reviewer_removal_requires_confirmation")
  })
})

describe("acceptWorkspaceInvitation", () => {
  const future = () => new Date(Date.now() + 60_000)
  const user = { id: "u1", email: "invitee@example.com" }

  it("rejects an expired invitation", async () => {
    db.workspaceInvitation = { findUnique: vi.fn().mockResolvedValue({ id: "i1", workspaceId: "w1", email: user.email, role: "member", acceptedAt: null, expiresAt: new Date(Date.now() - 1000) }) }
    await expect(acceptWorkspaceInvitation("token", user)).rejects.toThrow("invitation_invalid")
  })

  it("rejects a different signed-in address", async () => {
    db.workspaceInvitation = { findUnique: vi.fn().mockResolvedValue({ id: "i1", workspaceId: "w1", email: "other@example.com", role: "member", acceptedAt: null, expiresAt: future() }) }
    await expect(acceptWorkspaceInvitation("token", user)).rejects.toThrow("invitation_email_mismatch")
  })

  it("is idempotent for the member who already accepted it", async () => {
    db.workspaceInvitation = { findUnique: vi.fn().mockResolvedValue({ id: "i1", workspaceId: "w1", email: user.email, role: "member", acceptedAt: new Date(), expiresAt: future() }) }
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue({ id: "m1" }) }
    expect(await acceptWorkspaceInvitation("token", user)).toBe("w1")
  })

  it("still refuses a used invitation for someone who is not a member", async () => {
    db.workspaceInvitation = { findUnique: vi.fn().mockResolvedValue({ id: "i1", workspaceId: "w1", email: user.email, role: "member", acceptedAt: new Date(), expiresAt: future() }) }
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue(null) }
    await expect(acceptWorkspaceInvitation("token", user)).rejects.toThrow("invitation_invalid")
  })

  it("adds the member and marks the invitation accepted, with no seat limit to check", async () => {
    db.workspaceInvitation = { findUnique: vi.fn().mockResolvedValue({ id: "i1", workspaceId: "w1", email: user.email, role: "member", acceptedAt: null, expiresAt: future() }), update: vi.fn().mockReturnValue("accept") }
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockReturnValue("upsert") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }
    db.user = { findUnique: vi.fn().mockResolvedValue({ id: user.id, name: "Invitee", email: user.email }) }

    expect(await acceptWorkspaceInvitation("token", user)).toBe("w1")
    expect(db.$transaction).toHaveBeenCalledWith(["upsert", "accept", "audit"])
  })
})

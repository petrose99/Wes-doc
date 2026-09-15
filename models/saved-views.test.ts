import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: {} }))

const { listSavedViews, createSavedView, duplicateSavedView, updateSavedView, deleteSavedView, shareSavedView, canEditSavedView, SYSTEM_VIEWS_BY_VIEW_KEY } = await import("@/models/saved-views")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "v1", workspaceId: "w1", viewKey: "invoices", name: "All", ownerId: null,
  isSystem: true, scopeToCurrentUser: false, columns: [], filters: {}, sort: null,
  createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.savedView = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
})

describe("listSavedViews", () => {
  it("seeds the screen's system views before listing", async () => {
    await listSavedViews({ workspaceId: "w1", viewKey: "invoices", userId: "u1" })
    expect(db.savedView.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: SYSTEM_VIEWS_BY_VIEW_KEY.invoices.map((seed) => expect.objectContaining({ workspaceId: "w1", viewKey: "invoices", name: seed.name, isSystem: true })),
    }))
  })

  it("only ever queries system views, workspace-shared views, or the caller's own", async () => {
    await listSavedViews({ workspaceId: "w1", viewKey: "invoices", userId: "u1" })
    expect(db.savedView.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ isSystem: true }, { ownerId: null }, { ownerId: "u1" }] }),
    }))
  })

  it("sorts system views first in seed order, then the rest alphabetically", async () => {
    db.savedView.findMany.mockResolvedValue([
      row({ id: "v-z", name: "Zzz view", isSystem: false, ownerId: "u1" }),
      row({ id: "v-touchless", name: "Touchless" }),
      row({ id: "v-a", name: "Aaa view", isSystem: false, ownerId: "u1" }),
      row({ id: "v-all", name: "All" }),
      row({ id: "v-needs-review", name: "Needs review" }),
    ])
    const views = await listSavedViews({ workspaceId: "w1", viewKey: "invoices", userId: "u1" })
    expect(views.map((v) => v.name)).toEqual(["All", "Needs review", "Touchless", "Aaa view", "Zzz view"])
  })

  it("does nothing for a viewKey with no system-view catalog", async () => {
    await listSavedViews({ workspaceId: "w1", viewKey: "purchase-orders", userId: "u1" })
    expect(db.savedView.createMany).not.toHaveBeenCalled()
  })
})

describe("createSavedView", () => {
  it("refuses a blank name", async () => {
    await expect(createSavedView({ workspaceId: "w1", viewKey: "invoices", name: "   ", ownerId: "u1", filters: {} })).rejects.toThrow("saved_view_name_required")
  })

  it("creates a personal, non-system view scoped to the actor", async () => {
    db.savedView.create.mockResolvedValue(row({ id: "v2", name: "Big vendors", isSystem: false, ownerId: "u1", filters: { status: "unreviewed" } }))
    await createSavedView({ workspaceId: "w1", viewKey: "invoices", name: "Big vendors", ownerId: "u1", filters: { status: "unreviewed" } })
    expect(db.savedView.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workspaceId: "w1", viewKey: "invoices", name: "Big vendors", ownerId: "u1", isSystem: false }),
    }))
  })

  it("surfaces a duplicate name as saved_view_name_taken, not the raw P2002", async () => {
    db.savedView.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))
    await expect(createSavedView({ workspaceId: "w1", viewKey: "invoices", name: "All", ownerId: "u1", filters: {} })).rejects.toThrow("saved_view_name_taken")
  })

  it("re-throws an unrelated error", async () => {
    db.savedView.create.mockRejectedValue(new Error("connection reset"))
    await expect(createSavedView({ workspaceId: "w1", viewKey: "invoices", name: "X", ownerId: "u1", filters: {} })).rejects.toThrow("connection reset")
  })
})

describe("duplicateSavedView", () => {
  it("refuses an unknown source view", async () => {
    db.savedView.findFirst.mockResolvedValue(null)
    await expect(duplicateSavedView({ workspaceId: "w1", viewKey: "invoices", sourceViewId: "missing", name: "Copy", ownerId: "u1" })).rejects.toThrow("saved_view_not_found")
  })

  it("forks a system view's filters into a new personal view", async () => {
    db.savedView.findFirst.mockResolvedValue(row({ filters: { touchless: "1" } }))
    db.savedView.create.mockResolvedValue(row({ id: "v3", name: "My touchless", isSystem: false, ownerId: "u1", filters: { touchless: "1" } }))
    await duplicateSavedView({ workspaceId: "w1", viewKey: "invoices", sourceViewId: "v1", name: "My touchless", ownerId: "u1" })
    expect(db.savedView.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "My touchless", ownerId: "u1", isSystem: false, filters: { touchless: "1" } }),
    }))
  })
})

describe("canEditSavedView", () => {
  it("never allows editing a system view, even for an owner", () => {
    expect(canEditSavedView({ isSystem: true, ownerId: null }, { userId: "u1", role: "owner" })).toBe(false)
  })

  it("allows the creator", () => {
    expect(canEditSavedView({ isSystem: false, ownerId: "u1" }, { userId: "u1", role: "reviewer" })).toBe(true)
  })

  it("allows a workspace owner even when they didn't create it", () => {
    expect(canEditSavedView({ isSystem: false, ownerId: "someone-else" }, { userId: "u1", role: "owner" })).toBe(true)
  })

  it("refuses a non-owner, non-creator", () => {
    expect(canEditSavedView({ isSystem: false, ownerId: "someone-else" }, { userId: "u1", role: "reviewer" })).toBe(false)
  })
})

describe("updateSavedView", () => {
  it("refuses to edit a system view", async () => {
    db.savedView.findFirst.mockResolvedValue(row())
    await expect(updateSavedView({ workspaceId: "w1", viewId: "v1", actor: { userId: "u1", role: "owner" }, name: "Renamed" })).rejects.toThrow("saved_view_edit_forbidden")
  })

  it("refuses a non-creator, non-owner editing a shared view", async () => {
    db.savedView.findFirst.mockResolvedValue(row({ isSystem: false, ownerId: "creator" }))
    await expect(updateSavedView({ workspaceId: "w1", viewId: "v1", actor: { userId: "someone-else", role: "reviewer" }, name: "Renamed" })).rejects.toThrow("saved_view_edit_forbidden")
  })

  it("lets the creator rename their own view", async () => {
    db.savedView.findFirst.mockResolvedValue(row({ isSystem: false, ownerId: "u1" }))
    db.savedView.update.mockResolvedValue(row({ isSystem: false, ownerId: "u1", name: "Renamed" }))
    await updateSavedView({ workspaceId: "w1", viewId: "v1", actor: { userId: "u1", role: "reviewer" }, name: "Renamed" })
    expect(db.savedView.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "v1" }, data: expect.objectContaining({ name: "Renamed" }) }))
  })
})

describe("deleteSavedView", () => {
  it("refuses to delete a system view", async () => {
    db.savedView.findFirst.mockResolvedValue(row())
    await expect(deleteSavedView({ workspaceId: "w1", viewId: "v1", actor: { userId: "u1", role: "owner" } })).rejects.toThrow("saved_view_edit_forbidden")
    expect(db.savedView.delete).not.toHaveBeenCalled()
  })

  it("lets a workspace owner delete another user's shared view", async () => {
    db.savedView.findFirst.mockResolvedValue(row({ isSystem: false, ownerId: "creator" }))
    await deleteSavedView({ workspaceId: "w1", viewId: "v1", actor: { userId: "owner-user", role: "owner" } })
    expect(db.savedView.delete).toHaveBeenCalledWith({ where: { id: "v1" } })
  })
})

describe("shareSavedView", () => {
  it("refuses a system view", async () => {
    db.savedView.findFirst.mockResolvedValue(row())
    await expect(shareSavedView({ workspaceId: "w1", viewId: "v1", actorId: "u1" })).rejects.toThrow("saved_view_edit_forbidden")
  })

  it("refuses anyone but the view's own creator, including a workspace owner", async () => {
    db.savedView.findFirst.mockResolvedValue(row({ isSystem: false, ownerId: "creator" }))
    await expect(shareSavedView({ workspaceId: "w1", viewId: "v1", actorId: "owner-user" })).rejects.toThrow("saved_view_edit_forbidden")
  })

  it("clears ownerId when the creator shares their own view", async () => {
    db.savedView.findFirst.mockResolvedValue(row({ isSystem: false, ownerId: "u1" }))
    db.savedView.update.mockResolvedValue(row({ isSystem: false, ownerId: null }))
    await shareSavedView({ workspaceId: "w1", viewId: "v1", actorId: "u1" })
    expect(db.savedView.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { ownerId: null } })
  })
})

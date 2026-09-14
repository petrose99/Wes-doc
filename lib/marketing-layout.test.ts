import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserBySupabaseUserId: vi.fn(),
  getWorkspacesForUser: vi.fn(),
}))

vi.mock("@/components/marketing/nav", () => ({ MarketingNav: "nav" }))
vi.mock("@/components/marketing/footer", () => ({ MarketingFooter: "footer" }))
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }))
vi.mock("@/models/users", () => ({ getUserBySupabaseUserId: mocks.getUserBySupabaseUserId }))
vi.mock("@/models/workspaces", () => ({ getWorkspacesForUser: mocks.getWorkspacesForUser }))

import MarketingLayout from "../app/(marketing)/layout"

describe("MarketingLayout", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getSession.mockResolvedValue({ user: { id: "supabase-user" } })
    mocks.getUserBySupabaseUserId.mockResolvedValue({ id: "local-user" })
    mocks.getWorkspacesForUser.mockResolvedValue([{ id: "workspace-1" }])
  })

  it("keeps the public page available when the local user lookup fails", async () => {
    mocks.getUserBySupabaseUserId.mockRejectedValueOnce(new Error("database unavailable"))

    const layout = await MarketingLayout({ children: "content" })
    const [nav] = layout.props.children

    expect(nav.props.workspaceHref).toBeUndefined()
    expect(mocks.getWorkspacesForUser).not.toHaveBeenCalled()
  })

  it("keeps the public page available when the workspace lookup fails", async () => {
    mocks.getWorkspacesForUser.mockRejectedValueOnce(new Error("database unavailable"))

    const layout = await MarketingLayout({ children: "content" })
    const [nav] = layout.props.children

    expect(nav.props.workspaceHref).toBeUndefined()
  })

  it("keeps the workspace link when both local lookups succeed", async () => {
    const layout = await MarketingLayout({ children: "content" })
    const [nav] = layout.props.children

    expect(nav.props.workspaceHref).toBe("/workspaces/workspace-1")
  })
})

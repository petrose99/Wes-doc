import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const notFoundSignal = new Error("NEXT_NOT_FOUND")
const redirectSignal = (url: string) => {
  const e = new Error(`NEXT_REDIRECT:${url}`)
  ;(e as unknown as { digest: string }).digest = `NEXT_REDIRECT;push;${url};307;`
  throw e
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw notFoundSignal
  },
  redirect: (url: string) => redirectSignal(url),
}))

const getCurrentUserMock = vi.fn()
const getApiUserMock = vi.fn()
const getSessionMock = vi.fn()

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
  getApiUser: () => getApiUserMock(),
  getSession: () => getSessionMock(),
}))

const { requireAdminPage, requireAdminActor, isAdmin, isAalSufficient } = await import("@/lib/admin")

const adminUser = { id: "u1", email: "admin@example.com", role: "admin" }
const memberUser = { id: "u2", email: "user@example.com", role: "member" }

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env = { ...originalEnv }
  delete process.env.BREAK_GLASS_ADMIN_EMAIL
  getCurrentUserMock.mockReset()
  getApiUserMock.mockReset()
  getSessionMock.mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("isAdmin / isAalSufficient", () => {
  it("recognises the admin role", () => {
    expect(isAdmin(adminUser)).toBe(true)
    expect(isAdmin(memberUser)).toBe(false)
    expect(isAdmin(null)).toBe(false)
  })
  it("only accepts aal2 as sufficient", () => {
    expect(isAalSufficient("aal2")).toBe(true)
    expect(isAalSufficient("aal1")).toBe(false)
    expect(isAalSufficient(null)).toBe(false)
  })
})

describe("requireAdminPage", () => {
  it("passes an admin at aal2", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser)
    getSessionMock.mockResolvedValue({ aal: "aal2" })
    await expect(requireAdminPage()).resolves.toEqual(adminUser)
  })

  it("redirects an admin at aal1 to MFA challenge", async () => {
    getCurrentUserMock.mockResolvedValue(adminUser)
    getSessionMock.mockResolvedValue({ aal: "aal1" })
    await expect(requireAdminPage()).rejects.toThrow(/NEXT_REDIRECT:\/mfa\/challenge/)
  })

  it("404s a non-admin", async () => {
    getCurrentUserMock.mockResolvedValue(memberUser)
    getSessionMock.mockResolvedValue({ aal: "aal2" })
    await expect(requireAdminPage()).rejects.toBe(notFoundSignal)
  })

  it("allows a break-glass allow-listed admin at aal1 and logs it", async () => {
    process.env.BREAK_GLASS_ADMIN_EMAIL = "admin@example.com"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    getCurrentUserMock.mockResolvedValue(adminUser)
    getSessionMock.mockResolvedValue({ aal: "aal1" })
    await expect(requireAdminPage()).resolves.toEqual(adminUser)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[break-glass]"))
  })
})

describe("requireAdminActor", () => {
  it("returns admin at aal2", async () => {
    getApiUserMock.mockResolvedValue(adminUser)
    getSessionMock.mockResolvedValue({ aal: "aal2" })
    await expect(requireAdminActor()).resolves.toEqual(adminUser)
  })
  it("returns null for an admin at aal1", async () => {
    getApiUserMock.mockResolvedValue(adminUser)
    getSessionMock.mockResolvedValue({ aal: "aal1" })
    await expect(requireAdminActor()).resolves.toBeNull()
  })
  it("returns null for a non-admin", async () => {
    getApiUserMock.mockResolvedValue(memberUser)
    getSessionMock.mockResolvedValue({ aal: "aal2" })
    await expect(requireAdminActor()).resolves.toBeNull()
  })
  it("allows break-glass admin at aal1 and logs", async () => {
    process.env.BREAK_GLASS_ADMIN_EMAIL = "admin@example.com"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    getApiUserMock.mockResolvedValue(adminUser)
    getSessionMock.mockResolvedValue({ aal: "aal1" })
    await expect(requireAdminActor()).resolves.toEqual(adminUser)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[break-glass]"))
  })
})

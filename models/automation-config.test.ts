import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/audit", () => ({ auditEventData: vi.fn((data) => data), getRequestAuditContext: vi.fn().mockResolvedValue({}) }))

const { deriveAutonomyLevel, getOrCreateAutomationConfig, updateAutomationConfig } = await import("./automation-config")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.workspaceAutomationConfig = {
    findUnique: vi.fn(),
    create: vi.fn().mockResolvedValue({ workspaceId: "w1", touchlessEnabled: false }),
    update: vi.fn().mockResolvedValue({ workspaceId: "w1", touchlessEnabled: true }),
  }
  db.documentAuditEvent = { create: vi.fn() }
  db.$transaction = vi.fn((ops: unknown[]) => Promise.all(ops))
})

describe("deriveAutonomyLevel", () => {
  it("returns touchless when the flag is on", () => {
    expect(deriveAutonomyLevel({ touchlessEnabled: true })).toBe("touchless")
  })
  it("returns auto when touchless is off", () => {
    expect(deriveAutonomyLevel({ touchlessEnabled: false })).toBe("auto")
  })
})

describe("getOrCreateAutomationConfig", () => {
  it("creates on first read", async () => {
    db.workspaceAutomationConfig.findUnique.mockResolvedValue(null)
    await getOrCreateAutomationConfig("w1")
    expect(db.workspaceAutomationConfig.create).toHaveBeenCalledWith({ data: { workspaceId: "w1" } })
  })
  it("returns the existing row", async () => {
    db.workspaceAutomationConfig.findUnique.mockResolvedValue({ workspaceId: "w1", touchlessEnabled: true })
    const config = await getOrCreateAutomationConfig("w1")
    expect(config).toEqual({ workspaceId: "w1", touchlessEnabled: true })
    expect(db.workspaceAutomationConfig.create).not.toHaveBeenCalled()
  })
})

describe("updateAutomationConfig", () => {
  it("maps autonomyLevel touchless → touchlessEnabled true", async () => {
    db.workspaceAutomationConfig.findUnique.mockResolvedValue({ workspaceId: "w1" })
    await updateAutomationConfig({ workspaceId: "w1", actorId: "u1", patch: { autonomyLevel: "touchless" } })
    expect(db.workspaceAutomationConfig.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ touchlessEnabled: true }),
    }))
  })

  it("maps autonomyLevel auto → touchlessEnabled false", async () => {
    db.workspaceAutomationConfig.findUnique.mockResolvedValue({ workspaceId: "w1" })
    await updateAutomationConfig({ workspaceId: "w1", actorId: "u1", patch: { autonomyLevel: "auto" } })
    expect(db.workspaceAutomationConfig.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ touchlessEnabled: false }),
    }))
  })

  it("rejects an out-of-range minConfidence", async () => {
    db.workspaceAutomationConfig.findUnique.mockResolvedValue({ workspaceId: "w1" })
    await expect(updateAutomationConfig({ workspaceId: "w1", actorId: "u1", patch: { minConfidence: 1.5 } })).rejects.toThrow()
  })

  it("accepts an amountBands array", async () => {
    db.workspaceAutomationConfig.findUnique.mockResolvedValue({ workspaceId: "w1" })
    await updateAutomationConfig({
      workspaceId: "w1", actorId: "u1",
      patch: { amountBands: [{ min: 0, max: 100, minConfidence: 0.7 }] },
    })
    expect(db.workspaceAutomationConfig.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amountBands: [{ min: 0, max: 100, minConfidence: 0.7 }] }),
    }))
  })
})

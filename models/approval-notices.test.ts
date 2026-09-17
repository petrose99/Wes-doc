import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/email", () => ({ isEmailConfigured: vi.fn(() => true), resend: { emails: { send: vi.fn().mockResolvedValue({ id: "m" }) } } }))
vi.mock("@/lib/gates/list", () => ({ listOpenGatesForDocuments: vi.fn().mockResolvedValue(new Map()) }))
vi.mock("@react-email/render", () => ({ render: vi.fn().mockResolvedValue("text") }))

const { sendApprovalNotices, sendSentBackNotice } = await import("@/models/approval-notices")
const { prisma } = await import("@/lib/db")
const { isEmailConfigured, resend } = await import("@/lib/email")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
const send = resend.emails.send as unknown as ReturnType<typeof vi.fn>
const now = new Date("2026-09-16T12:00:00Z")
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000)
const reachedAt = hoursAgo(1)

function task(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "t1", workspaceId: "w1", documentId: "d1", createdById: "starter", currentStageIndex: 0, stageReachedAt: reachedAt,
    workflow: { stages: [{ stageIndex: 0, requireOwner: false, name: "Finance", approverIds: ["alice", "bob"], minAmount: null }] },
    document: { reviewedData: { vendor: "Northwind", invoice_number: "NW-1", total: 120.5, currency_code: "USD" }, cancelledAt: null, docType: "invoice", paymentStatus: "paid", template: { code: "invoice" } },
    workspace: { name: "Acme", baseCurrency: "USD", timezone: "UTC" },
    ...over,
  }
}
function user(id: string, over: Partial<Record<string, unknown>> = {}) {
  return { id, email: `${id}@x.com`, emailVerified: true, approvalNoticeEmails: true, ...over }
}
function member(userId: string, over: Partial<Record<string, unknown>> = {}) {
  return { workspaceId: "w1", userId, role: "member", noticeLastSentAt: null, ...over }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(isEmailConfigured as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true)
  send.mockResolvedValue({ id: "m" })
  for (const key of Object.keys(db)) delete db[key]
  db.reviewTask = { findMany: vi.fn().mockResolvedValue([]) }
  db.approvalNotice = { findMany: vi.fn().mockResolvedValue([]), create: vi.fn((args) => args) }
  db.user = { findMany: vi.fn().mockResolvedValue([user("alice"), user("bob"), user("starter")]), findUnique: vi.fn().mockResolvedValue(user("starter")) }
  db.workspaceMember = {
    findMany: vi.fn().mockResolvedValue([member("alice"), member("bob"), member("starter", { role: "owner" })]),
    findUnique: vi.fn().mockResolvedValue(member("starter")),
    update: vi.fn((args) => args),
  }
  db.workspace = { findUnique: vi.fn().mockResolvedValue({ name: "Acme" }) }
  db.document = { findUnique: vi.fn().mockResolvedValue({ reviewedData: {} }) }
  db.documentCheckResult = { findMany: vi.fn().mockResolvedValue([]) }
  db.integrationPush = { findMany: vi.fn().mockResolvedValue([]) }
  db.$transaction = vi.fn().mockResolvedValue([])
})

describe("sendApprovalNotices", () => {
  it("skips entirely when email is not configured", async () => {
    ;(isEmailConfigured as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)
    expect(await sendApprovalNotices(now)).toEqual({ skipped: "email-not-configured" })
    expect(db.reviewTask.findMany).not.toHaveBeenCalled()
  })

  it("sends one 'reached' mail per approver, never to the starter, and stamps the floor", async () => {
    db.reviewTask.findMany.mockResolvedValue([task()])
    const result = await sendApprovalNotices(now)
    expect(result).toEqual({ sent: 2 })
    const recipients = send.mock.calls.map((call) => call[0].to).sort()
    expect(recipients).toEqual(["alice@x.com", "bob@x.com"])
    expect(send.mock.calls[0][0].subject).toContain("Acme")
    expect(send.mock.calls[0][0].headers["List-Unsubscribe"]).toMatch(/\/notices\/stop\/confirm\?t=/)
    expect(db.approvalNotice.create).toHaveBeenCalledTimes(2)
    expect(db.approvalNotice.create).toHaveBeenCalledWith({ data: expect.objectContaining({ reviewTaskId: "t1", userId: "alice", kind: "reached", stageReachedAt: reachedAt }) })
    expect(db.workspaceMember.update).toHaveBeenCalledWith({ where: { workspaceId_userId: { workspaceId: "w1", userId: "alice" } }, data: { noticeLastSentAt: now } })
  })

  it("coalesces several reached rows into one mail per person", async () => {
    db.reviewTask.findMany.mockResolvedValue([task(), task({ id: "t2", documentId: "d2" })])
    expect(await sendApprovalNotices(now)).toEqual({ sent: 2 })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][0].subject).toMatch(/2 invoices/)
  })

  it("honours the one-hour floor per (workspace, person)", async () => {
    db.reviewTask.findMany.mockResolvedValue([task()])
    db.workspaceMember.findMany.mockResolvedValue([member("alice", { noticeLastSentAt: hoursAgo(0.5) }), member("bob", { noticeLastSentAt: hoursAgo(2) }), member("starter", { role: "owner" })])
    expect(await sendApprovalNotices(now)).toEqual({ sent: 1 })
    expect(send.mock.calls[0][0].to).toBe("bob@x.com")
  })

  it("excludes the switched-off, the unverified, the removed member and the decided task", async () => {
    db.reviewTask.findMany.mockResolvedValue([task(), task({ id: "t2", documentId: "d2", document: { ...task().document, cancelledAt: now } })])
    db.user.findMany.mockResolvedValue([user("alice", { approvalNoticeEmails: false }), user("bob", { emailVerified: false })])
    expect(await sendApprovalNotices(now)).toEqual({ sent: 0 })
    expect(send).not.toHaveBeenCalled()
  })

  it("falls back to owners when the stage names nobody, still skipping the starter", async () => {
    db.reviewTask.findMany.mockResolvedValue([task({ workflow: { stages: [{ stageIndex: 0, requireOwner: true, name: "Owner", approverIds: [], minAmount: null }] } })])
    db.workspaceMember.findMany.mockImplementation(async (args: { where: { role?: string } }) =>
      args.where.role === "owner" ? [{ userId: "alice" }, { userId: "starter" }] : [member("alice", { role: "owner" }), member("starter", { role: "owner" })],
    )
    expect(await sendApprovalNotices(now)).toEqual({ sent: 1 })
    expect(send.mock.calls[0][0].to).toBe("alice@x.com")
  })

  it("waits while the row is Not eligible (open exception)", async () => {
    db.reviewTask.findMany.mockResolvedValue([task()])
    db.documentCheckResult.findMany.mockResolvedValue([{ documentId: "d1" }])
    expect(await sendApprovalNotices(now)).toEqual({ sent: 0 })
  })

  it("nudges after 48h, at most twice, 72h apart", async () => {
    db.reviewTask.findMany.mockResolvedValue([task({ stageReachedAt: hoursAgo(200) })])
    db.user.findMany.mockResolvedValue([user("alice")])
    const base = { reviewTaskId: "t1", userId: "alice", stageReachedAt: hoursAgo(200) }
    db.approvalNotice.findMany.mockResolvedValue([{ ...base, kind: "reached", sentAt: hoursAgo(199) }])
    expect(await sendApprovalNotices(now)).toEqual({ sent: 1 })
    expect(send.mock.calls[0][0].subject).toMatch(/^Still waiting/)

    send.mockClear()
    db.approvalNotice.findMany.mockResolvedValue([{ ...base, kind: "reached", sentAt: hoursAgo(199) }, { ...base, kind: "nudge", sentAt: hoursAgo(10) }])
    expect(await sendApprovalNotices(now)).toEqual({ sent: 0 })

    db.approvalNotice.findMany.mockResolvedValue([{ ...base, kind: "reached", sentAt: hoursAgo(199) }, { ...base, kind: "nudge", sentAt: hoursAgo(150) }, { ...base, kind: "nudge", sentAt: hoursAgo(75) }])
    expect(await sendApprovalNotices(now)).toEqual({ sent: 0 })
  })

  it("treats a restarted stage as reached again (keyed on stageReachedAt) and a task never sits in both sections", async () => {
    db.reviewTask.findMany.mockResolvedValue([task({ stageReachedAt: reachedAt })])
    db.user.findMany.mockResolvedValue([user("alice")])
    db.approvalNotice.findMany.mockResolvedValue([{ reviewTaskId: "t1", userId: "alice", kind: "reached", sentAt: hoursAgo(300), stageReachedAt: hoursAgo(301) }])
    expect(await sendApprovalNotices(now)).toEqual({ sent: 1 })
    expect(send.mock.calls[0][0].subject).not.toMatch(/Still waiting/)
    expect(db.approvalNotice.create).toHaveBeenCalledTimes(1)
  })

  it("does not stamp when the send fails", async () => {
    db.reviewTask.findMany.mockResolvedValue([task()])
    db.user.findMany.mockResolvedValue([user("alice")])
    send.mockRejectedValue(new Error("resend down"))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(await sendApprovalNotices(now)).toEqual({ sent: 0 })
    expect(db.$transaction).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe("sendSentBackNotice", () => {
  const input = { workspaceId: "w1", workspaceName: "Acme", documentId: "d1", taskId: "t1", createdById: "starter", actorId: "alice", actorName: "Alice", reason: "Wrong PO", supplier: "Northwind", invoiceNumber: "NW-1", amount: 10, currency: "USD" }

  it("mails the starter without stamping the floor", async () => {
    await sendSentBackNotice(input)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].to).toBe("starter@x.com")
    expect(send.mock.calls[0][0].subject).toMatch(/^Sent back for review/)
    expect(db.workspaceMember.update).not.toHaveBeenCalled()
  })

  it("sends nothing to a starter who left the workspace or switched off", async () => {
    db.workspaceMember.findUnique.mockResolvedValue(null)
    await sendSentBackNotice(input)
    db.workspaceMember.findUnique.mockResolvedValue(member("starter"))
    db.user.findUnique.mockResolvedValue(user("starter", { approvalNoticeEmails: false }))
    await sendSentBackNotice(input)
    expect(send).not.toHaveBeenCalled()
  })
})

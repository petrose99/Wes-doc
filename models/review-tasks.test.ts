import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

const { assignReviewTask, bulkUpdateReviewTaskStatus, cancelApprovalOnDocument, createReviewTask, decideReviewTaskStage, getActiveWorkflowStageState, parseReviewTaskStatus, sendReviewTaskBackForReview, updateReviewTaskStatus } = await import("@/models/review-tasks")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.$transaction = vi.fn(async (operations: unknown[]) => operations)
  // WP-AP2: default "no push exists" so the payment-status gate still fires under existing
  // tests unless a specific test overrides it to simulate a ledger sync in flight.
  db.integrationPush = { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) }
  // #253: no default flow unless a test sets one — the shipped behaviour (approvals start by hand).
  db.workspace = { findUnique: vi.fn().mockResolvedValue({ defaultApprovalWorkflow: null }) }
  db.gate = { findMany: vi.fn().mockResolvedValue([]) }
})

describe("parseReviewTaskStatus", () => {
  it("accepts a known status", () => {
    expect(parseReviewTaskStatus("in_review")).toBe("in_review")
  })

  it("rejects anything else", () => {
    expect(parseReviewTaskStatus("archived")).toBeNull()
    expect(parseReviewTaskStatus(null)).toBeNull()
  })
})

describe("createReviewTask", () => {
  it("refuses a document outside the workspace", async () => {
    db.document = { findFirst: vi.fn().mockResolvedValue(null) }
    await expect(createReviewTask({ workspaceId: "w1", documentId: "d1", createdById: "u1" })).rejects.toThrow("document_not_found")
  })

  it("creates the task and an audit event in one transaction", async () => {
    db.document = { findFirst: vi.fn().mockResolvedValue({ id: "d1" }) }
    db.reviewTask = { create: vi.fn().mockReturnValue("create-task") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await createReviewTask({ workspaceId: "w1", documentId: "d1", createdById: "u1", detail: "looks off" })

    expect(db.reviewTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workspaceId: "w1", documentId: "d1", reason: "manual", detail: "looks off" }),
    }))
    expect(db.$transaction).toHaveBeenCalledWith(["create-task", "audit"])
  })

  // #253: the default flow auto-starts at task creation unless something says no.
  it("auto-starts the workspace's default flow when it is active and nothing blocks the document", async () => {
    db.document = { findFirst: vi.fn().mockResolvedValue({ id: "d1" }) }
    db.reviewTask = { create: vi.fn().mockReturnValue("create-task") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }
    db.workspace = { findUnique: vi.fn().mockResolvedValue({ defaultApprovalWorkflow: { id: "wf-default", name: "Two-step", active: true } }) }

    await createReviewTask({ workspaceId: "w1", documentId: "d1", createdById: "u1" })

    expect(db.reviewTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workflowId: "wf-default", currentStageIndex: 0, status: "in_review" }),
    }))
    expect(db.documentAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "review_task_workflow_auto_started", actorId: null }),
    }))
  })

  it("does not auto-start an inactive default, or one the document's open hard gate blocks", async () => {
    db.document = { findFirst: vi.fn().mockResolvedValue({ id: "d1" }) }
    db.reviewTask = { create: vi.fn().mockReturnValue("create-task") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }
    db.workspace = { findUnique: vi.fn().mockResolvedValue({ defaultApprovalWorkflow: { id: "wf-default", name: "Two-step", active: false } }) }
    await createReviewTask({ workspaceId: "w1", documentId: "d1", createdById: "u1" })
    expect(db.reviewTask.create.mock.calls[0][0].data.workflowId).toBeUndefined()

    db.workspace = { findUnique: vi.fn().mockResolvedValue({ defaultApprovalWorkflow: { id: "wf-default", name: "Two-step", active: true } }) }
    db.gate = { findMany: vi.fn().mockResolvedValue([{ documentId: "d1" }]) }
    await createReviewTask({ workspaceId: "w1", documentId: "d1", createdById: "u1" })
    expect(db.reviewTask.create.mock.calls[1][0].data.workflowId).toBeUndefined()
  })

  it("keeps an explicit workflowId over the default, with no auto-start event", async () => {
    db.document = { findFirst: vi.fn().mockResolvedValue({ id: "d1" }) }
    db.reviewTask = { create: vi.fn().mockReturnValue("create-task") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }
    db.workspace = { findUnique: vi.fn().mockResolvedValue({ defaultApprovalWorkflow: { id: "wf-default", name: "Two-step", active: true } }) }
    await createReviewTask({ workspaceId: "w1", documentId: "d1", createdById: "u1", workflowId: "wf-explicit" })
    expect(db.reviewTask.create.mock.calls[0][0].data.workflowId).toBe("wf-explicit")
    expect(db.documentAuditEvent.create).toHaveBeenCalledTimes(1)
  })

  it("starts at stage 0 and status in_review when a workflowId is given", async () => {
    db.document = { findFirst: vi.fn().mockResolvedValue({ id: "d1" }) }
    db.reviewTask = { create: vi.fn().mockReturnValue("create-task") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await createReviewTask({ workspaceId: "w1", documentId: "d1", createdById: "u1", workflowId: "wf1" })

    expect(db.reviewTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workflowId: "wf1", currentStageIndex: 0, status: "in_review" }),
    }))
  })
})

describe("updateReviewTaskStatus", () => {
  it("refuses an unknown task", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue(null) }
    await expect(updateReviewTaskStatus({ workspaceId: "w1", taskId: "t1", status: "approved", actorId: "u1" })).rejects.toThrow("review_task_not_found")
  })

  it("stamps resolvedAt when moving to a terminal status", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", status: "open", document: { docType: "contract", paymentStatus: null, template: null } }), update: vi.fn().mockReturnValue("update") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await updateReviewTaskStatus({ workspaceId: "w1", taskId: "t1", status: "approved", actorId: "u1" })

    expect(db.reviewTask.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "approved", resolvedAt: expect.any(Date) } })
  })

  it("leaves resolvedAt null for a non-terminal status", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", status: "open" }), update: vi.fn().mockReturnValue("update") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await updateReviewTaskStatus({ workspaceId: "w1", taskId: "t1", status: "in_review", actorId: "u1" })

    expect(db.reviewTask.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "in_review", resolvedAt: null } })
  })
})

describe("decideReviewTaskStage", () => {
  it("refuses a task with no workflow attached", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", workflowId: null, currentStageIndex: null, workflow: null }) }
    await expect(decideReviewTaskStage({ workspaceId: "w1", taskId: "t1", decision: "approve", actorId: "u1", actorRole: "member" })).rejects.toThrow("review_task_has_no_workflow")
  })

  it("refuses a member deciding a stage that requires an owner", async () => {
    db.reviewTask = {
      findFirst: vi.fn().mockResolvedValue({
        id: "t1", documentId: "d1", currentStageIndex: 0,
        workflow: { stages: [{ stageIndex: 0, requireOwner: true, name: "Finance sign-off" }] },
      }),
    }
    await expect(decideReviewTaskStage({ workspaceId: "w1", taskId: "t1", decision: "approve", actorId: "u1", actorRole: "member" })).rejects.toThrow("stage_requires_owner")
  })

  it("advances to the next stage and keeps status in_review", async () => {
    db.reviewTask = {
      findFirst: vi.fn().mockResolvedValue({
        id: "t1", documentId: "d1", currentStageIndex: 0,
        workflow: { stages: [{ stageIndex: 0, requireOwner: false, name: "First pass" }, { stageIndex: 1, requireOwner: false, name: "Second pass" }] },
      }),
      update: vi.fn().mockReturnValue("update"),
    }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await decideReviewTaskStage({ workspaceId: "w1", taskId: "t1", decision: "approve", actorId: "u1", actorRole: "member" })

    expect(db.reviewTask.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "in_review", currentStageIndex: 1, resolvedAt: null, stageReachedAt: expect.any(Date) } })
  })

  it("resolves as approved once the last stage clears", async () => {
    db.reviewTask = {
      findFirst: vi.fn().mockResolvedValue({
        id: "t1", documentId: "d1", currentStageIndex: 0,
        workflow: { stages: [{ stageIndex: 0, requireOwner: false, name: "Only stage" }] },
        document: { docType: "contract", paymentStatus: null, template: null },
      }),
      update: vi.fn().mockReturnValue("update"),
    }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await decideReviewTaskStage({ workspaceId: "w1", taskId: "t1", decision: "approve", actorId: "u1", actorRole: "owner" })

    expect(db.reviewTask.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "approved", currentStageIndex: 0, resolvedAt: expect.any(Date) } })
  })

  it("rejects immediately regardless of remaining stages", async () => {
    db.reviewTask = {
      findFirst: vi.fn().mockResolvedValue({
        id: "t1", documentId: "d1", currentStageIndex: 0,
        workflow: { stages: [{ stageIndex: 0, requireOwner: false, name: "First" }, { stageIndex: 1, requireOwner: false, name: "Second" }] },
      }),
      update: vi.fn().mockReturnValue("update"),
    }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await decideReviewTaskStage({ workspaceId: "w1", taskId: "t1", decision: "reject", actorId: "u1", actorRole: "member" })

    expect(db.reviewTask.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "rejected", currentStageIndex: 0, resolvedAt: expect.any(Date) } })
  })
})

describe("bulkUpdateReviewTaskStatus", () => {
  it("writes one audit event per task actually found in this workspace", async () => {
    const nonGated = { docType: "contract", paymentStatus: null, template: null }
    db.reviewTask = {
      findMany: vi.fn().mockResolvedValue([
        { id: "t1", documentId: "d1", status: "open", document: nonGated },
        { id: "t2", documentId: "d2", status: "open", document: nonGated },
      ]),
      updateMany: vi.fn().mockReturnValue("update-many"),
    }
    db.documentAuditEvent = { create: vi.fn((args: unknown) => args) }

    const result = await bulkUpdateReviewTaskStatus({ workspaceId: "w1", taskIds: ["t1", "t2", "t3"], status: "approved", actorId: "u1" })

    expect(result.updated).toBe(2)
    expect(result.blockedTaskIds).toEqual([])
    expect(db.reviewTask.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["t1", "t2", "t3"] }, workspaceId: "w1" } }))
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.$transaction.mock.calls[0][0]).toHaveLength(3) // updateMany + 2 audit events
  })

  it("does nothing when none of the ids belong to this workspace", async () => {
    db.reviewTask = { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() }
    const result = await bulkUpdateReviewTaskStatus({ workspaceId: "w1", taskIds: ["t1"], status: "approved", actorId: "u1" })
    expect(result.updated).toBe(0)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe("assignReviewTask", () => {
  it("refuses to assign to someone who is not a workspace member", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1" }) }
    db.workspaceMember = { findUnique: vi.fn().mockResolvedValue(null) }
    await expect(assignReviewTask({ workspaceId: "w1", taskId: "t1", assigneeId: "u2", actorId: "u1" })).rejects.toThrow("assignee_not_a_member")
  })

  it("allows clearing the assignee without a membership check", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1" }), update: vi.fn().mockReturnValue("update") }
    db.workspaceMember = { findUnique: vi.fn() }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await assignReviewTask({ workspaceId: "w1", taskId: "t1", assigneeId: null, actorId: "u1" })

    expect(db.workspaceMember.findUnique).not.toHaveBeenCalled()
    expect(db.reviewTask.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { assigneeId: null } })
  })
})

describe("payment status gate on approval", () => {
  const invoiceUnconfirmed = { docType: "invoice", paymentStatus: null, template: null }
  const invoiceConfirmed = { docType: "invoice", paymentStatus: "unpaid", template: null }
  const contract = { docType: "contract", paymentStatus: null, template: null }

  describe("updateReviewTaskStatus", () => {
    it("refuses to approve an invoice with no payment confirmation", async () => {
      db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", status: "open", document: invoiceUnconfirmed }) }
      await expect(updateReviewTaskStatus({ workspaceId: "w1", taskId: "t1", status: "approved", actorId: "u1" })).rejects.toThrow("payment_status_required")
    })

    it("does not gate a non-terminal status change", async () => {
      db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", status: "open", document: invoiceUnconfirmed }), update: vi.fn().mockReturnValue("update") }
      db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }
      await expect(updateReviewTaskStatus({ workspaceId: "w1", taskId: "t1", status: "in_review", actorId: "u1" })).resolves.toBeDefined()
    })

    it("approves once payment status has been confirmed", async () => {
      db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", status: "open", document: invoiceConfirmed }), update: vi.fn().mockReturnValue("update") }
      db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }
      await expect(updateReviewTaskStatus({ workspaceId: "w1", taskId: "t1", status: "approved", actorId: "u1" })).resolves.toBeDefined()
    })

    it("never gates a document type with no payment state of its own", async () => {
      db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", status: "open", document: contract }), update: vi.fn().mockReturnValue("update") }
      db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }
      await expect(updateReviewTaskStatus({ workspaceId: "w1", taskId: "t1", status: "approved", actorId: "u1" })).resolves.toBeDefined()
    })

    it("WP-AP2: bypasses the gate when a pending or succeeded IntegrationPush already exists", async () => {
      // A ledger sync is in flight / has landed — QuickBooks/Xero/Bigcapital will fill in
      // paymentStatus authoritatively, so asking the reviewer to guess is friction with no signal.
      db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", status: "open", document: invoiceUnconfirmed }), update: vi.fn().mockReturnValue("update") }
      db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }
      db.integrationPush.findFirst.mockResolvedValue({ id: "push-1" })
      await expect(updateReviewTaskStatus({ workspaceId: "w1", taskId: "t1", status: "approved", actorId: "u1" })).resolves.toBeDefined()
      expect(db.integrationPush.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "w1", documentId: "d1", status: { in: ["pending", "succeeded"] } }),
      }))
    })

    it("WP-AP2: still gates when a push exists but only in a failed / cancelled state", async () => {
      // A failed push does NOT mean the ledger will fill paymentStatus in — treat as if no push
      // exists at all. The gate re-engages.
      db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", status: "open", document: invoiceUnconfirmed }) }
      db.integrationPush.findFirst.mockResolvedValue(null)
      await expect(updateReviewTaskStatus({ workspaceId: "w1", taskId: "t1", status: "approved", actorId: "u1" })).rejects.toThrow("payment_status_required")
    })
  })

  describe("decideReviewTaskStage", () => {
    it("gates the LAST stage clearing, which is what actually resolves the task", async () => {
      db.reviewTask = {
        findFirst: vi.fn().mockResolvedValue({
          id: "t1", documentId: "d1", currentStageIndex: 0,
          workflow: { stages: [{ stageIndex: 0, requireOwner: false, name: "Only stage" }] },
          document: invoiceUnconfirmed,
        }),
      }
      await expect(decideReviewTaskStage({ workspaceId: "w1", taskId: "t1", decision: "approve", actorId: "u1", actorRole: "owner" })).rejects.toThrow("payment_status_required")
    })

    it("does not gate an intermediate stage advance", async () => {
      db.reviewTask = {
        findFirst: vi.fn().mockResolvedValue({
          id: "t1", documentId: "d1", currentStageIndex: 0,
          workflow: { stages: [{ stageIndex: 0, requireOwner: false, name: "First" }, { stageIndex: 1, requireOwner: false, name: "Second" }] },
          document: invoiceUnconfirmed,
        }),
        update: vi.fn().mockReturnValue("update"),
      }
      db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }
      await expect(decideReviewTaskStage({ workspaceId: "w1", taskId: "t1", decision: "approve", actorId: "u1", actorRole: "member" })).resolves.toBeDefined()
    })

    it("never gates a reject, regardless of stage", async () => {
      db.reviewTask = {
        findFirst: vi.fn().mockResolvedValue({
          id: "t1", documentId: "d1", currentStageIndex: 0,
          workflow: { stages: [{ stageIndex: 0, requireOwner: false, name: "Only stage" }] },
          document: invoiceUnconfirmed,
        }),
        update: vi.fn().mockReturnValue("update"),
      }
      db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }
      await expect(decideReviewTaskStage({ workspaceId: "w1", taskId: "t1", decision: "reject", actorId: "u1", actorRole: "member" })).resolves.toBeDefined()
    })
  })

  describe("bulkUpdateReviewTaskStatus", () => {
    it("withholds only the tasks missing payment confirmation, approving the rest", async () => {
      db.reviewTask = {
        findMany: vi.fn().mockResolvedValue([
          { id: "t1", documentId: "d1", status: "open", document: invoiceConfirmed },
          { id: "t2", documentId: "d2", status: "open", document: invoiceUnconfirmed },
          { id: "t3", documentId: "d3", status: "open", document: contract },
        ]),
        updateMany: vi.fn().mockReturnValue("update-many"),
      }
      db.documentAuditEvent = { create: vi.fn((args: unknown) => args) }

      const result = await bulkUpdateReviewTaskStatus({ workspaceId: "w1", taskIds: ["t1", "t2", "t3"], status: "approved", actorId: "u1" })

      expect(result.updated).toBe(2)
      expect(result.blockedTaskIds).toEqual(["t2"])
      expect(result.documentIds).toEqual(["d1", "d3"])
      expect(db.reviewTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["t1", "t3"] }, workspaceId: "w1" } }))
    })

    it("WP-AP2: does not block tasks whose document has a pending/succeeded IntegrationPush", async () => {
      db.reviewTask = {
        findMany: vi.fn().mockResolvedValue([
          { id: "t1", documentId: "d1", status: "open", document: invoiceUnconfirmed },
          { id: "t2", documentId: "d2", status: "open", document: invoiceUnconfirmed },
        ]),
        updateMany: vi.fn().mockReturnValue("update-many"),
      }
      db.documentAuditEvent = { create: vi.fn((args: unknown) => args) }
      // Only d1 has a ledger push in flight — d2 stays blocked.
      db.integrationPush.findMany.mockResolvedValue([{ documentId: "d1" }])

      const result = await bulkUpdateReviewTaskStatus({ workspaceId: "w1", taskIds: ["t1", "t2"], status: "approved", actorId: "u1" })

      expect(result.updated).toBe(1)
      expect(result.blockedTaskIds).toEqual(["t2"])
      expect(result.documentIds).toEqual(["d1"])
      // One batched query, not two — pattern matters when a controller is bulk-approving 40 bills.
      expect(db.integrationPush.findMany).toHaveBeenCalledTimes(1)
    })

    it("runs no transaction at all when every selected task is blocked", async () => {
      db.reviewTask = {
        findMany: vi.fn().mockResolvedValue([{ id: "t1", documentId: "d1", status: "open", document: invoiceUnconfirmed }]),
        updateMany: vi.fn(),
      }
      const result = await bulkUpdateReviewTaskStatus({ workspaceId: "w1", taskIds: ["t1"], status: "approved", actorId: "u1" })
      expect(result).toEqual({ updated: 0, blockedTaskIds: ["t1"], documentIds: [] })
      expect(db.$transaction).not.toHaveBeenCalled()
    })
  })
})

describe("sendReviewTaskBackForReview", () => {
  it("refuses a task with no workflow attached", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", workflowId: null, currentStageIndex: null, status: "in_review" }) }
    await expect(sendReviewTaskBackForReview({ workspaceId: "w1", taskId: "t1", actorId: "u1", reason: "wrong supplier" })).rejects.toThrow("review_task_has_no_workflow")
  })

  it("refuses a task that isn't currently in_review", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", workflowId: "wf1", currentStageIndex: 0, status: "approved" }) }
    await expect(sendReviewTaskBackForReview({ workspaceId: "w1", taskId: "t1", actorId: "u1", reason: "wrong supplier" })).rejects.toThrow("review_task_not_in_review")
  })

  it("requires a non-empty reason", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", workflowId: "wf1", currentStageIndex: 1, status: "in_review" }) }
    await expect(sendReviewTaskBackForReview({ workspaceId: "w1", taskId: "t1", actorId: "u1", reason: "   " })).rejects.toThrow("reason_required")
  })

  it("clears the workflow and reopens the task with a reason on the audit trail", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", workflowId: "wf1", currentStageIndex: 1, status: "in_review" }), update: vi.fn().mockReturnValue("update") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await sendReviewTaskBackForReview({ workspaceId: "w1", taskId: "t1", actorId: "u1", reason: "wrong supplier" })

    expect(db.reviewTask.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "open", workflowId: null, currentStageIndex: null, stageReachedAt: null, resolvedAt: null } })
    expect(db.documentAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "review_task_sent_back", detail: { reason: "wrong supplier" } }) }))
  })
})

describe("cancelApprovalOnDocument", () => {
  it("refuses once a stage has already advanced", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", workflowId: "wf1", currentStageIndex: 1, status: "in_review" }) }
    await expect(cancelApprovalOnDocument({ workspaceId: "w1", taskId: "t1", actorId: "u1" })).rejects.toThrow("approval_already_advanced")
  })

  it("refuses a task with no workflow attached", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", workflowId: null, currentStageIndex: null, status: "in_review" }) }
    await expect(cancelApprovalOnDocument({ workspaceId: "w1", taskId: "t1", actorId: "u1" })).rejects.toThrow("review_task_has_no_workflow")
  })

  it("clears the workflow while still at stage 0, no reason required", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue({ id: "t1", documentId: "d1", workflowId: "wf1", currentStageIndex: 0, status: "in_review" }), update: vi.fn().mockReturnValue("update") }
    db.documentAuditEvent = { create: vi.fn().mockReturnValue("audit") }

    await cancelApprovalOnDocument({ workspaceId: "w1", taskId: "t1", actorId: "u1" })

    expect(db.reviewTask.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "open", workflowId: null, currentStageIndex: null, resolvedAt: null } })
  })
})

describe("getActiveWorkflowStageState", () => {
  it("returns null when the document has no active workflow task", async () => {
    db.reviewTask = { findFirst: vi.fn().mockResolvedValue(null) }
    expect(await getActiveWorkflowStageState("w1", "d1")).toBeNull()
  })

  it("returns the stage list and current index for an in-review workflow task", async () => {
    db.reviewTask = {
      findFirst: vi.fn().mockResolvedValue({
        currentStageIndex: 1,
        workflow: { stages: [{ stageIndex: 0, name: "First pass" }, { stageIndex: 1, name: "Manager" }, { stageIndex: 2, name: "Owner" }] },
      }),
    }
    expect(await getActiveWorkflowStageState("w1", "d1")).toEqual({
      currentStageIndex: 1,
      stages: [{ stageIndex: 0, name: "First pass" }, { stageIndex: 1, name: "Manager" }, { stageIndex: 2, name: "Owner" }],
    })
    expect(db.reviewTask.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: "w1", documentId: "d1", workflowId: { not: null }, status: { in: ["open", "in_review"] } },
    }))
  })
})

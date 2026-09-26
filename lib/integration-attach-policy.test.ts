import { attachOutcome, computeAttachUpdate, MAX_ATTACH_ATTEMPTS } from "@/lib/integration-attach-policy"
import { describe, expect, it } from "vitest"

const now = new Date("2026-09-26T12:00:00Z")

describe("attachOutcome", () => {
  it("succeeds on a successful attempt regardless of attempt count", () => {
    expect(attachOutcome(1, true, now)).toEqual({ status: "succeeded", nextAttemptAt: null })
    expect(attachOutcome(MAX_ATTACH_ATTEMPTS, true, now)).toEqual({ status: "succeeded", nextAttemptAt: null })
  })

  it("schedules a backoff retry on failure below the cap", () => {
    const outcome = attachOutcome(1, false, now)
    expect(outcome.status).toBe("pending")
    expect((outcome as { nextAttemptAt: Date }).nextAttemptAt.getTime()).toBeGreaterThan(now.getTime())
  })

  it("gives up once attempts reach MAX_ATTACH_ATTEMPTS (5, its own cap)", () => {
    expect(MAX_ATTACH_ATTEMPTS).toBe(5)
    expect(attachOutcome(MAX_ATTACH_ATTEMPTS, false, now)).toEqual({ status: "failed", nextAttemptAt: null })
    expect(attachOutcome(MAX_ATTACH_ATTEMPTS - 1, false, now).status).toBe("pending")
  })
})

describe("computeAttachUpdate", () => {
  it("increments attempts and marks succeeded with the external id on success", () => {
    const update = computeAttachUpdate(0, { success: true, errorCode: null, externalAttachmentId: "att_1" }, now)
    expect(update).toMatchObject({ status: "succeeded", attempts: 1, errorCode: null, externalAttachmentId: "att_1", leaseUntil: null })
    expect(update.completedAt).toEqual(now)
  })

  it("stays pending with a future nextAttemptAt on a retryable failure", () => {
    const update = computeAttachUpdate(1, { success: false, errorCode: "http_500", externalAttachmentId: null }, now)
    expect(update.status).toBe("pending")
    expect(update.attempts).toBe(2)
    expect(update.errorCode).toBe("http_500")
    expect(update.completedAt).toBeNull()
    expect(update.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime())
  })

  it("fails terminally once attempts exhaust the cap", () => {
    const update = computeAttachUpdate(MAX_ATTACH_ATTEMPTS - 1, { success: false, errorCode: "http_500", externalAttachmentId: null }, now)
    expect(update.status).toBe("failed")
    expect(update.attempts).toBe(MAX_ATTACH_ATTEMPTS)
    expect(update.completedAt).toEqual(now)
  })

  it("forces a terminal failure immediately for a permanent error (e.g. attach_oversize)", () => {
    const update = computeAttachUpdate(0, { success: false, errorCode: "attach_oversize", externalAttachmentId: null }, now, true)
    expect(update.status).toBe("failed")
    expect(update.attempts).toBe(1)
    expect(update.completedAt).toEqual(now)
  })

  it("clears errorCode on success even if a prior attempt had one", () => {
    const update = computeAttachUpdate(2, { success: true, errorCode: null, externalAttachmentId: "att_9" }, now)
    expect(update.errorCode).toBeNull()
  })
})

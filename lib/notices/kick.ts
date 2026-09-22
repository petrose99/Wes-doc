import config from "@/lib/config"

/** Fire-and-forget nudge at the internal drain so an Approval notice lands within seconds of a
 * stage being reached, rather than waiting for the next cron tick — same shape as
 * lib/webhook-delivery.ts's kickWebhookDrain and lib/document-processing.ts's kickEmbedJob. The
 * drain itself (app/api/internal/jobs/process/route.ts) is the guarantee; a dropped kick just
 * means the next cron tick picks it up. */
export async function kickApprovalNoticeDrain(): Promise<void> {
  try {
    await fetch(`${config.app.baseURL}/api/internal/jobs/process`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.aws.internalWorkerSecret}` },
      body: JSON.stringify({ drainApprovalNotices: true }),
      signal: AbortSignal.timeout(5000),
    })
  } catch { /* swallowed: the drain drivers are the guarantee, this is only latency */ }
}

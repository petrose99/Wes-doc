import { sweepOldProductEvents } from "@/lib/analytics"
import { processNextQueuedDocumentJob } from "@/lib/document-processing"
import { processNextWebhookDelivery } from "@/lib/webhook-delivery"
import { drainIntegrationPushes } from "@/lib/integration-push"
import { syncDueLedgerConnections } from "@/lib/health/sync"
import { drainProvisionJobs } from "@/models/bigcapital"
import { runDueHealthChecks } from "@/models/health"
import { sendDueReminders } from "@/models/reminders"
import { verifyProductionConfig } from "@/lib/verify-production-config"

const IDLE_DELAY_MS = 5_000
/** How often the analytics retention sweep runs. Once an hour, not every idle tick: a DELETE
 * against product_events costs nothing at this table's size today, but there is no reason to pay
 * it dozens of times a minute when the data it is clearing out is 90 days stale either way. */
const ANALYTICS_SWEEP_INTERVAL_MS = 60 * 60_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run() {
  verifyProductionConfig()
  console.log("Job worker starting…")
  let lastSweepAt = 0
  for (;;) {
    const jobId = await processNextQueuedDocumentJob().catch((error) => {
      console.error("Job worker failed", error instanceof Error ? error.message : "unknown_error")
      return null
    })
    // Drain one webhook delivery per iteration alongside document jobs. "Either did work" keeps the
    // loop hot; only a fully idle pass sleeps, so neither queue starves the other.
    const deliveryId = await processNextWebhookDelivery().catch((error) => {
      console.error("Webhook delivery failed", error instanceof Error ? error.message : "unknown_error")
      return null
    })
    // Everything below this line otherwise runs ONLY from app/api/internal/jobs/process, which a
    // scheduler is expected to hit. This deployment has no such scheduler — no crontab, no
    // platform cron — so without draining them here they never run at all. That is what left
    // Bigcapital provisioning showing "provisioning…" forever: the row sat pending with attempts=0
    // because nothing had ever claimed it.
    //
    // Draining them every tick is what that route already does on its cron hit, and is safe for the
    // same reason it gives: each one gates itself (reminders on isReminderDue, ledger sync on 24h
    // staleness, health checks once per calendar day), so a hot loop costs a cheap query, not
    // repeated work. Each is caught separately — one failing queue must not stop the others, and
    // must not kill the loop.
    // sendDueReminders answers {reviewTasks, expenseClaims} where the rest answer a count, so it is
    // reduced to one here. An object is always truthy: left as-is it would report work on every
    // idle tick and, worse, keep `didWork` permanently true so the loop never slept.
    const [provisionJobs, integrationPushes, reminders, ledgerSyncs, healthChecks] = await Promise.all([
      drainProvisionJobs().catch((error) => { console.error("Provision drain failed", error instanceof Error ? error.message : "unknown_error"); return 0 }),
      drainIntegrationPushes().catch((error) => { console.error("Integration push drain failed", error instanceof Error ? error.message : "unknown_error"); return 0 }),
      sendDueReminders().then(({ reviewTasks, expenseClaims }) => reviewTasks + expenseClaims)
        .catch((error) => { console.error("Reminder drain failed", error instanceof Error ? error.message : "unknown_error"); return 0 }),
      syncDueLedgerConnections().catch((error) => { console.error("Ledger sync failed", error instanceof Error ? error.message : "unknown_error"); return 0 }),
      runDueHealthChecks().catch((error) => { console.error("Health checks failed", error instanceof Error ? error.message : "unknown_error"); return 0 }),
    ])
    const drainedCount = provisionJobs + integrationPushes + reminders + ledgerSyncs + healthChecks
    if (provisionJobs) console.log("Provisioned integrations", provisionJobs)
    if (integrationPushes) console.log("Pushed to integrations", integrationPushes)
    if (reminders) console.log("Sent reminders", reminders)
    if (ledgerSyncs) console.log("Synced ledger connections", ledgerSyncs)
    if (healthChecks) console.log("Ran health checks", healthChecks)
    if (jobId) console.log("Processed job", jobId)
    if (deliveryId) console.log("Delivered webhook", deliveryId)
    if (Date.now() - lastSweepAt >= ANALYTICS_SWEEP_INTERVAL_MS) {
      lastSweepAt = Date.now()
      await sweepOldProductEvents().then((deleted) => { if (deleted) console.log("Swept stale analytics events", deleted) })
        .catch((error) => console.error("Analytics sweep failed", error instanceof Error ? error.message : "unknown_error"))
    }
    if (!jobId && !deliveryId && !drainedCount) await sleep(IDLE_DELAY_MS)
  }
}

run().catch(() => process.exit(1))

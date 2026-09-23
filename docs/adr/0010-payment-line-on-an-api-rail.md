---
status: accepted
---

# The Payment line on an API rail: sent by a job, looked up before any resend, settled only by the rail's own answer

ADR 0009 dropped the batch file: an approved batch pays through a rail's API, and Chaperone is the first rail. Chaperone takes **one call per line**. It has not documented whether a repeated reference is safe, its status callbacks are **unsigned**, it can reverse a payment it reported settled, and it pays from a prefunded balance that can run out mid-batch. We decided (#424) how a line moves under those conditions. This ADR supersedes ADR 0007's batch and line lifecycle. ADR 0007's line identity stands: one line per row per batch, a Line reference that is never reused, one open line per invoice or claim, and one settle entry point.

## The model

- **The seam.** One pay-supplier call per line, and its payment ID is the Line reference. The **rail belongs to the Payer account**, which holds:
  - the rail (`chaperone`, or `simulated` outside production; bank routes later);
  - the merchant number and credentials, stored encrypted in DocuBite;
  - the currency;
  - a connected or needs-reconnect status.

  Only Owners connect or change it, and every change is audited. A Payer account with no rail can't pay batches, but stays usable for Mark as paid. A rail declares its currencies and destination types, and a Payee is eligible for a batch only if the batch's Payer account's rail can reach them in the batch's currency. No batch mixes rails.
- **Batch.** Pending approval → Approved, or Rejected (only while pending). After approval the batch reads as its lines: *Sending n of m*, *Paused — balance too low*, *Settled*. Owners have two actions after approval: **Send remaining** (after a top-up) and **Withdraw unsent lines**.
- **Line.** Queued → **Sending** → Sent → Paid | Failed, or Withdrawn. **Sending** means handed to the rail with the outcome not yet known. A Sending line is never submitted again until a lookup by its reference says the rail doesn't have it.
- **Sending is a background job, not the approve click.** Approval queues the lines, and the job submits them one at a time. It records each result before taking the next, so a restart resumes and never starts over. Just before submitting each line, the job re-checks the Payee's hold. A Payout details change withdraws that Payee's unsent lines (*Payout details changed*), and the rest of the batch carries on.
- **Submit outcomes:**
  - A definite refusal (invalid wallet, failed ID check) makes the line **Failed** with the rail's reason, and the row returns to Bill Pay.
  - An insufficient balance leaves the unsent lines Queued and the batch **Paused**, with no automatic retry.
  - A timeout or error leaves the line **Sending** until a lookup resolves it.
- **Status.** A callback settles nothing: it only triggers a lookup made with the workspace's own credentials. The job also checks every Sent line on a slowing schedule, from every minute up to daily, and stops checking automatically after 30 days. No line is ever failed by a timer.
  - A Sent line with no answer after 24 hours reads *No answer from Chaperone yet*, and an Owner may mark it Paid or Failed by hand with a reason.
  - A Sending line whose lookups have failed for 24 hours reads *Can't reach Chaperone*, with the same by-hand path.
  - Marking by hand is never allowed on a Sending line that lookups can still resolve.
- **Reversal.** A rail-reported reversal of a Paid line makes it **Failed** (*Reversed by Chaperone*). Its Payment record is removed with that reason, the row returns to Bill Pay, and Owners get one email.
- **A late Paid** on a line that was Failed or marked by hand still settles, and raises **Paid twice** if the bill was paid again.
- **Payment record.** `method` is the rail, `reference` is the rail's transaction id, and `paidOn` is the rail's settlement date. `batch` stays only on old records.
- **Money actions are Owner-only:** Send remaining, Withdraw unsent lines, and marking by hand. Members can see every state.
- **Migration.** Pending legacy batches are rejected (*Payments now go through C-Pay — batch again*). Approved and legacy-sent batches are **never** submitted to a rail: their lines become Sent with the source *bank file (before C-Pay)* and settle only by hand. The build reports how many of each exist before migrating.
- **The simulated rail** is a real rail behind the seam, refused in production builds. On command it accepts, refuses, reports Paid, Failed or Reversed, times out, reports twice, or runs out of balance. Every case above is tested against it.

## Considered

- *Submit inside the approve click.* Rejected: many calls to a rail that can be slow or down. A restart would lose track of which lines went.
- *Resend on timeout under the same reference.* Rejected until Chaperone documents idempotency: look it up first.
- *Trust callbacks.* Rejected: they are unsigned.
- *Keep Returned as its own path.* Dropped: it came from statement matching. A rail reversal is Failed with a reason.

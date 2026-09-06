/** A7.7: rate-limit-aware push queue. QuickBooks: 500 requests / minute per realm. Xero:
 * 60 / minute + 5000 / day per tenant. Bigcapital: unlimited (customer-hosted). A push that
 * would breach the bucket is DEFERRED (nextAttemptAt pushed out until the bucket resets)
 * instead of consumed as an attempt, so a workspace never burns its 5-attempt limit on
 * provider-side backpressure. Pure token-bucket accounting; the executor calls tryClaim before
 * making a provider call, and reportCall on every response (whether or not it was a 429). */

export type Bucket = {
  perMinute: number
  perDay: number | null
}

export const PROVIDER_BUCKETS: Record<string, Bucket> = {
  quickbooks: { perMinute: 500, perDay: null },
  xero: { perMinute: 60, perDay: 5000 },
  bigcapital: { perMinute: 10_000, perDay: null },
}

export type RateWindow = {
  /** Timestamps (unix ms) of every call made against this bucket in the last day. */
  callTimestamps: number[]
}

export type ClaimVerdict = { allowed: true } | { allowed: false; retryAfterMs: number; reason: "per_minute" | "per_day" }

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * 60_000

function pruned(window: RateWindow, now: number): RateWindow {
  return { callTimestamps: window.callTimestamps.filter((ts) => now - ts < DAY_MS) }
}

export function tryClaim(bucket: Bucket, window: RateWindow, now: number): ClaimVerdict {
  const pruned_ = pruned(window, now)
  const inMinute = pruned_.callTimestamps.filter((ts) => now - ts < MINUTE_MS).length
  if (inMinute >= bucket.perMinute) {
    const oldest = pruned_.callTimestamps.filter((ts) => now - ts < MINUTE_MS).sort((a, b) => a - b)[0]
    return { allowed: false, retryAfterMs: MINUTE_MS - (now - oldest) + 100, reason: "per_minute" }
  }
  if (bucket.perDay !== null && pruned_.callTimestamps.length >= bucket.perDay) {
    const oldest = pruned_.callTimestamps.sort((a, b) => a - b)[0]
    return { allowed: false, retryAfterMs: DAY_MS - (now - oldest) + 1_000, reason: "per_day" }
  }
  return { allowed: true }
}

/** Adds one call at `now` to the window. Returns the new window (pure; the caller persists it). */
export function reportCall(window: RateWindow, now: number): RateWindow {
  const pruned_ = pruned(window, now)
  return { callTimestamps: [...pruned_.callTimestamps, now] }
}

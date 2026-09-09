import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"

/** The rate at which `base` converts into `quote` on `effectiveDate`. Anchored to a date — a
 * 2024 invoice processed in 2026 must book at 2024's rate, not today's — and frozen once
 * fetched so the same document sums to the same number across page loads.
 *
 * source records which provider supplied it: "frankfurter" / "fastratesapi" /
 * "frankfurter+triangulated" / "identity" for the trivial same-currency case. */
export type FxRateHit = {
  base: string
  quote: string
  effectiveDate: string  // ISO date, YYYY-MM-DD
  rate: number
  source: string
}

const ISO_CURRENCY = /^[A-Z]{3}$/

function normalizeCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase()
  return ISO_CURRENCY.test(trimmed) ? trimmed : null
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function isToday(dateIso: string, now: Date): boolean {
  return dateIso === isoDate(now)
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Frankfurter — free wrapper around the ECB reference feed. Historical back to 1999, no key,
 * base can be any of ECB's ~30 supported currencies. Endpoint shape:
 *   GET https://api.frankfurter.app/{YYYY-MM-DD}?from=EUR&to=USD  → {"amount":1,"base":"EUR",
 *                                                                   "date":"2024-03-15",
 *                                                                   "rates":{"USD":1.0891}}
 * "latest" for today. `date` may snap backward to the previous business day (weekends/holidays);
 * the response's own `date` is authoritative and is what we cache the row under. */
async function fetchFrankfurter(base: string, quote: string, dateIso: string, timeoutMs: number): Promise<{ rate: number; date: string } | null> {
  const path = isToday(dateIso, new Date()) ? "latest" : dateIso
  const url = `${config.fx.frankfurterBase}/${path}?from=${base}&to=${quote}`
  const data = await fetchJson(url, timeoutMs) as { rates?: Record<string, number>; date?: string } | null
  const rate = data?.rates?.[quote]
  const date = data?.date
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || typeof date !== "string") return null
  return { rate, date }
}

/** Optional today-only path via fastratesapi (or any single-pair "latest" endpoint the user has a
 * key for). Uses a URL template with {from}/{to}/{key} placeholders because different tiers /
 * providers expose different exact paths and param names — the user pastes the template that
 * matches their dashboard. The response is expected to contain a `rate` or a `rates[quote]`;
 * both common shapes are handled. Returns null on any parse failure and lets Frankfurter cover it. */
async function fetchFastRatesToday(base: string, quote: string, timeoutMs: number): Promise<number | null> {
  const template = config.fx.fastratesUrlTemplate
  const key = config.fx.fastratesKey
  if (!template || !key) return null
  const url = template
    .replaceAll("{from}", base)
    .replaceAll("{to}", quote)
    .replaceAll("{key}", encodeURIComponent(key))
  const data = await fetchJson(url, timeoutMs) as { rate?: number; result?: number; rates?: Record<string, number> } | null
  const rate = data?.rate ?? data?.result ?? data?.rates?.[quote]
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null
  return rate
}

async function readCache(base: string, quote: string, dateIso: string): Promise<FxRateHit | null> {
  const row = await prisma.fxRate.findUnique({ where: { fx_rates_base_quote_date_key: { base, quote, effectiveDate: new Date(dateIso) } } })
  if (!row) return null
  return { base: row.base, quote: row.quote, effectiveDate: isoDate(row.effectiveDate), rate: Number(row.rate), source: row.source }
}

async function writeCache(hit: FxRateHit): Promise<void> {
  await prisma.fxRate.upsert({
    where: { fx_rates_base_quote_date_key: { base: hit.base, quote: hit.quote, effectiveDate: new Date(hit.effectiveDate) } },
    create: { base: hit.base, quote: hit.quote, effectiveDate: new Date(hit.effectiveDate), rate: new Prisma.Decimal(hit.rate), source: hit.source },
    update: {},  // one row per pair per day — never overwrite, keep the first-fetched value stable
  })
}

/** The public entry point. Returns the rate for one unit of `from` in units of `to` on
 * `effectiveDate`, or null on any failure — never throws.
 *
 * Order of operations:
 *   1. Same-currency shortcut: {rate: 1, source: "identity"} without touching the network.
 *   2. Cache lookup keyed on (from, to, effectiveDate). Hit → return it.
 *   3. Today's rate: try fastratesapi first if configured, otherwise straight to Frankfurter.
 *   4. Historical: Frankfurter directly.
 *   5. Non-EUR ↔ non-EUR pair: triangulate through EUR (Frankfurter always uses EUR as its base
 *      internally, and cross rates via EUR are what the ECB itself publishes).
 *   6. Cache the result under BOTH the requested (from, to) key AND, when triangulated, the two
 *      EUR-anchored intermediate rows — so the next document in the same day gets a cache hit.
 *
 * Fail-safe: any leg that fails returns null; the caller stores fxRate=null and a retry drain
 * can re-attempt later. A partial success (one leg of a triangulation succeeded, the other did
 * not) still returns null — a half-triangulated rate would be wrong. */
export async function getHistoricalRate(from: string, to: string, effectiveDate: Date | string): Promise<FxRateHit | null> {
  const base = normalizeCode(typeof from === "string" ? from : "")
  const quote = normalizeCode(typeof to === "string" ? to : "")
  if (!base || !quote) return null
  const dateIso = typeof effectiveDate === "string" ? effectiveDate.slice(0, 10) : isoDate(effectiveDate)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null

  if (base === quote) return { base, quote, effectiveDate: dateIso, rate: 1, source: "identity" }

  const cached = await readCache(base, quote, dateIso)
  if (cached) return cached

  const timeoutMs = config.fx.timeoutMs
  const today = isToday(dateIso, new Date())

  // Direct pair, either via fastratesapi (today only, if configured) or Frankfurter.
  if (today) {
    const fast = await fetchFastRatesToday(base, quote, timeoutMs)
    if (fast !== null) {
      const hit: FxRateHit = { base, quote, effectiveDate: dateIso, rate: fast, source: "fastratesapi" }
      await writeCache(hit).catch(() => {})
      return hit
    }
  }

  // Frankfurter accepts any of its supported currencies as `from` — a direct EUR/USD, USD/EUR,
  // ZAR/USD all work. What it doesn't publish is the exotic-to-exotic cross itself.
  const direct = await fetchFrankfurter(base, quote, dateIso, timeoutMs)
  if (direct) {
    const hit: FxRateHit = { base, quote, effectiveDate: dateIso, rate: direct.rate, source: today ? "frankfurter" : "frankfurter" }
    // Cache under the response's own date — Frankfurter snaps to the previous business day for
    // weekends/holidays. The requested date is not what the row is FOR.
    await writeCache({ ...hit, effectiveDate: direct.date }).catch(() => {})
    // Also cache under the requested date so the next call for the same weekend hits the cache
    // instead of re-fetching. Two rows, same rate — the effectiveDate distinction is real.
    if (direct.date !== dateIso) await writeCache(hit).catch(() => {})
    return { ...hit, effectiveDate: direct.date }
  }

  // Triangulate via EUR. Only reachable when Frankfurter refused the direct pair — usually only
  // possible on future/nonsense dates or a rare currency it doesn't list.
  if (base !== "EUR" && quote !== "EUR") {
    const [baseToEur, eurToQuote] = await Promise.all([
      fetchFrankfurter(base, "EUR", dateIso, timeoutMs),
      fetchFrankfurter("EUR", quote, dateIso, timeoutMs),
    ])
    if (baseToEur && eurToQuote && baseToEur.date === eurToQuote.date) {
      const rate = baseToEur.rate * eurToQuote.rate
      const hit: FxRateHit = { base, quote, effectiveDate: baseToEur.date, rate, source: "frankfurter+triangulated" }
      await writeCache(hit).catch(() => {})
      // Cache the two intermediate legs too — a later ZAR→JPY on the same day will find them.
      await writeCache({ base, quote: "EUR", effectiveDate: baseToEur.date, rate: baseToEur.rate, source: "frankfurter" }).catch(() => {})
      await writeCache({ base: "EUR", quote, effectiveDate: eurToQuote.date, rate: eurToQuote.rate, source: "frankfurter" }).catch(() => {})
      return hit
    }
  }

  return null
}

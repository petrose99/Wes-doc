-- FX conversion: a document extracted in a foreign currency carries its converted total in the
-- workspace's base currency alongside the original. All four columns are frozen at conversion
-- time — a later shift in the underlying FX feed does not silently re-price historical documents,
-- and analytics/ledger totals stay stable between page loads.
--
-- base_currency_total is the converted amount rounded to the base currency's minor unit; null when
-- the document has not been converted yet (extraction hasn't produced total + currency_code) or
-- when the last fetch attempt failed (a retry drain re-tries these). NUMERIC(20,4) matches the
-- precision the ledger uses; four decimals give room for tiny values (e.g. JPY line items) after
-- rounding without lossy conversion.
--
-- fx_rate is the rate that was applied — 1.0 when the document's own currency equals the
-- workspace base (so a same-currency document still carries the trivial rate, making the "was this
-- converted?" check `fx_rate IS NOT NULL` uniformly). NUMERIC(20,10) — FX rates need more mantissa
-- than money.
--
-- fx_rate_at is the DATE the rate applies to (usually the invoice/received date), not the moment
-- of the fetch — a 2024 invoice processed in 2026 books at 2024's rate.
--
-- fx_rate_source records which provider supplied it: "frankfurter", "fastratesapi", or the
-- literal "identity" for same-currency documents.
ALTER TABLE "documents"
  ADD COLUMN "base_currency_total" DECIMAL(20, 4),
  ADD COLUMN "fx_rate"              DECIMAL(20, 10),
  ADD COLUMN "fx_rate_at"           DATE,
  ADD COLUMN "fx_rate_source"       TEXT;

-- Speeds up the "which documents are still waiting on FX?" scan (a retry drain and the pending
-- badge in the UI both need this) without dragging in the whole documents table.
CREATE INDEX "documents_fx_pending_idx" ON "documents" ("workspace_id")
  WHERE "base_currency_total" IS NULL;

-- Rate cache. Unique on (base, quote, effective_date): every provider publishes at most one rate
-- per pair per business day, and the same-day cache hit turns 200 EUR invoices into one API call.
--
-- rate is the price of 1 unit of `base` in units of `quote` — EUR/USD 1.0891 means one euro buys
-- 1.0891 US dollars. NUMERIC(20,10) matches documents.fx_rate; the two must be comparable.
--
-- source records which provider supplied this row so a later audit can tell frankfurter from
-- fastratesapi, and so a rate that came from EUR triangulation ("frankfurter+triangulated") is
-- distinguishable from a direct pair.
CREATE TABLE "fx_rates" (
  "id"             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  "base"           TEXT           NOT NULL,
  "quote"          TEXT           NOT NULL,
  "effective_date" DATE           NOT NULL,
  "rate"           DECIMAL(20,10) NOT NULL,
  "source"         TEXT           NOT NULL,
  "fetched_at"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fx_rates_base_quote_date_key" UNIQUE ("base", "quote", "effective_date")
);

CREATE INDEX "fx_rates_effective_date_idx" ON "fx_rates" ("effective_date");

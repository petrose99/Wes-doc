# Marketing site capability gap: what DocuBite ships vs. what the site claims

Resolves [159 — Capability-gap audit](https://github.com/petrose99/docubite/issues/159) on [Map: Marketing site tells the whole product, feature-navigable](https://github.com/petrose99/docubite/issues/157).

Method: read the shipped surface (`app/(app)/**`, `lib/**`, `prisma/schema.prisma`, `CONTEXT.md`, `docs/**`) and then every marketing file (`components/marketing/**`, `app/(marketing)/**`, `lib/solutions.ts`), and compared them. Env-gated items were judged from `.env.example` / `.env.production.example` and `lib/config.ts`, **not** from the running deployment — [163](https://github.com/petrose99/docubite/issues/163) exists to settle those against production.

---

## 0. Framing: half the marketing component tree is dead code

`components/marketing/` has **two generations** of content and only one is rendered.

**Live**, rendered by `app/(marketing)/page.tsx` in order: `landing/hero`, `reads-strip`, `proof`, `how-it-works`, `inline-cta`, `intake`, `extraction`, `provenance`, `folder-checks`, `pipeline`, `automation`, `sheets`, `accounting`, `multi-currency`, `library`, `comparison`, `faq`, `trial-cta`.

**Dead — imported by nothing** (14 files): `sections/hero.tsx`, `extraction-core.tsx`, `extraction-demo.tsx`, `faq.tsx`, `ai-band.tsx`, `provenance.tsx`, `folder-report.tsx`, `repeating-docs.tsx`, `repositioning.tsx`, `security.tsx`, `sharing.tsx`, `integrations-api.tsx`, `solutions-teaser.tsx`, `trust-strip.tsx`.

Only three `sections/` files are live: `doc-type-grid.tsx`, `cta-band.tsx`, `workflow.tsx` — used by `app/(marketing)/solutions/page.tsx` and `solutions/[slug]/page.tsx`.

Consequences:

- The dead `sections/faq.tsx` **actively contradicts the live site**: it says "Is DocuBite accounting software? **No… There is no ledger, no reconciliation… no automatic posting**" and "Email-in and cloud-drive imports **aren't available yet**." The live landing sells a built-in double-entry ledger and email intake as headline features. Resurrect that file and you ship a lie.
- `sections/extraction-core.tsx` carries "Nothing is skipped for being low quality" — a claim often cited as live. It is not rendered.
- `lib/solutions.ts:210` exports `PRODUCT_LINKS`, an earlier "Product mega-menu" pointing at `/#how`, `/#folders`, `/#integrations`, `/#security` — **none of those anchor ids exist on the live landing page**. Imported by nothing. It is the skeleton of the Product nav this map is designing, and it omits Controls, Close and Health.
- `components/marketing/prototype/landing-page-prototype.tsx` is dev-only, gated at `app/(marketing)/page.tsx:37`.
- Live nav (`components/marketing/nav.tsx:15`) exposes 5 links: Solutions, `#ap-loop`, `#extraction`, `#automation`, `#faq`. **Ten of the fifteen live landing sections are unreachable from the nav** — including finance/ledger, multi-currency, worksheets, provenance, checks and archive. `/pricing` is deliberately unlinked.

---

## 1. The real shipped capability surface

### Intake

| Capability | What it does | Where |
|---|---|---|
| Single-funnel ingestion | Every channel (upload, camera, email, zip, API) goes through one function doing workspace-wide byte-idempotency, malware scan, document creation; records a reason row when it refuses rather than throwing | `lib/ingestion.ts` |
| **Jurisdiction gate on all intake** | ⚠️ **Hard refusal**: no `workspace.jurisdictionCode` ⇒ no bill accepted through any channel | `lib/ingestion.ts:54`, `lib/jurisdictions/require.ts` |
| Batch / folder / zip upload | Whole-folder drag, zip expansion, one infected entry doesn't abort the batch, page-range selection per PDF | `lib/zip-ingestion.ts`, `lib/page-range.ts` |
| Inbound email intake | Per-workspace address token, sender allowlist, forwarded-sender attribution, zip expansion, inline-signature-image filtering, deterministic intent classification, **portal-link following** (unauthenticated PDF URLs under SSRF checks), **email-body-to-PDF** when the mail *is* the invoice | `app/api/inbound-email/route.ts`, `models/inbound-email.ts`, `lib/inbound/*`, `infra/cloudflare-email-worker/` |
| ⚠️ — but gated | `config.inboundEmail.enabled = Boolean(EMAIL_INBOUND_SECRET)`; unset in `.env`, `.env.example` **and** `.env.production.example`. Route 503s. `lib/config.ts:234`: "no inbound DNS/provider provisioned yet… a deliberate production decision". Settings page renders "Not yet active on this deployment" | `lib/config.ts:233-240` |
| Public REST API v1 | `POST /api/v1/documents` ingests a bill; list and per-document read; workspace-scoped bearer keys (`dbk_live_…`) | `app/api/v1/documents/route.ts`, `lib/api-v1.ts`, `lib/api-key.ts` |
| Dedupe before cost | Content-hash dedupe plus near-duplicate pairing before extraction spend | `lib/dedupe.ts` |

### Extraction and reading

| Capability | What it does | Where |
|---|---|---|
| MinerU parse → text-only LLM | Hosted MinerU, `is_ocr: true`, `model_version` default `"vlm"`, `enable_table: true`, `language: "auto"`. Returns markdown + per-page text + per-block bboxes + page sizes. **The page image never reaches the LLM** — text only | `lib/mineru.ts:79-83`, `lib/document-processing.ts:438` |
| Accepted formats | `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/heic`; webp/heic re-encoded to PNG; EXIF rotation applied | `lib/document-processing.ts:48`, `normalizeForMineru` |
| Image pre-normalisation | grayscale + contrast normalise + sharpen — **off by default**, `DOCUMENT_PREPROCESS_IMAGES` | `lib/document-processing.ts:127-134` |
| LLM classification pass | Cheap pre-extraction pass giving docType, category, split segment boundaries; non-fatal | `lib/classification.ts` |
| Auto-split of multi-doc PDFs | Confidence ≥ 0.7 and >1 segment ⇒ child documents per page range, each re-entering the pipeline | `lib/document-processing.ts:494`, `lib/boundary-detection.ts` |
| Worksheet re-pointing | A worksheet an intake channel *guessed* is overridden by the document's content at ≥0.8; a human's pick never is | `shouldReassignWorksheet` |
| Page-batched extraction + merge | Batches pages; merges scalar fields by per-field `mergeStrategy`, concatenates array fields, merges confidence and provenance index-aligned | `mergeExtractionPasses` |
| Page-level retrieval gate | BM25 + optional embeddings rank a long document's own pages against per-field queries; only top-K go to the LLM, with a required-field fallback sweep. ⚠️ Flagged off (`DOCUMENT_PAGE_RETRIEVAL`) | `lib/extraction/page-retrieval.ts` |
| Adaptive line-item schema | Discovers this document's real line-item columns, merges into the template's array field | `lib/adaptive-extraction.ts` |
| Continuation-row merging | String-only fragments at page boundaries merged onto the preceding numeric row; repeated headers dropped | `lib/extraction/merge-rows.ts` |
| **Bank-statement balance solver** | Running-balance constraint solver anchored on printed opening/closing balances; **auto-corrects single OCR-confusable digit misreads** before confidence is computed | `lib/extraction/balance-solver.ts` |
| **Confidence calibration** | Replaces the model's self-report with evidence: arithmetic identity reconciles ⇒ 0.99; value verbatim in OCR text ⇒ ≥0.95; number appearing **nowhere** in OCR text ⇒ capped 0.7 | `lib/extraction/calibrate.ts` |
| Targeted verification re-read | Suspect fields get ONE focused second LLM pass; corrections re-run calibration; audited as `extraction_verified` | `lib/extraction/verify.ts` |
| Conflict + missing-field detection | Scalar fields where two batches disagreed are flagged; missing required fields set `needs_review` | `findConflictingScalarFields` |
| Schema-free extraction | With no template fields, infers the whole field snapshot | `lib/extraction/infer-schema.ts` |
| Few-shot learning from corrections | Reviewer corrections become few-shot examples for that workspace+template | `models/field-corrections.ts` |
| **Shape memory** | Every run saves an `ExtractionShape` signature; the next similar upload is matched **before any AI runs** | `lib/shape-match.ts` |
| **Run diff** | This month's document vs last month's same shape: fields appeared/vanished, values moved, line items changed | `lib/run-diff.ts` |
| Custom worksheets/templates | Stable field keys, types, per-field extraction instructions, negative hints, retrieval hints, repeating tables, versioned | `lib/document-templates.ts` |
| Field suggestion from one sample | Proposes a typed field set off the first document | `lib/field-suggestions.ts` |
| Doc-type catalog | 9 types with amount-key and check field maps | `lib/doc-types.ts` |
| Domain packs | Schema adapters keyed by template code; finance core + optional; blank pack for dictation | `lib/domains/*` |
| **Structured field projection** | Every extracted value becomes a queryable `DocumentFieldValue` row with its own confidence, source, provenance — what analytics, health and search read | `lib/field-projection.ts` |

### Provenance

- **Per-value source pinning** — every scalar field and every array *row* keeps `Ref { page, bbox (0–1 normalised), quote, blockIndex, score }` resolved against MinerU blocks, with page remapping when a page range narrowed the parse. Below match score **0.55 the page is trusted but the rectangle is dropped to null**. `lib/provenance.ts`
- **Blocks sidecar** — parsed blocks written to object storage *before* LLM extraction, so provenance can be re-resolved later and indexing never depends on extraction succeeding. `lib/document-processing.ts:445-450`
- Audio provenance pinned to transcript time offsets. `lib/provenance-audio.ts`
- Click-to-source viewer; cell→source in the sheet. `app/api/documents/[documentId]/source/route.ts`, `components/sheet/extraction-bridge.ts`

### Deterministic checks and fraud controls

All wired into `models/document-checks.ts::runDeterministicChecks`.

| Check | What it catches |
|---|---|
| `lib/checks/bank-details.ts` | **Bank-detail change freeze** — supplier's remittance IBAN differs from previously seen ⇒ hard **fail**, never warn. The payment-diversion vector. |
| `lib/checks/split-invoices.ts` | Multiple same-supplier invoices in a window summing near an approval threshold |
| `lib/checks/pdf-forensics.ts` | DocInfo `/ModDate`//`Producer` vs XMP `xmp:ModifyDate`/`CreatorTool` mismatch — tampering fingerprint |
| `lib/checks/text-layer-divergence.ts` | Embedded PDF text layer vs OCR of the rendered page disagree on money tokens (Jaccard < 0.7) — invisible-glyph swap |
| `lib/checks/vendor-onboarding.ts` | New-vendor red-flag bundle |
| `lib/checks/amount-anomaly.ts` | Round-number spike + z-score outlier vs that supplier's rolling history |
| `lib/checks/duplicates.ts` | Exact + near duplicates, credit-note-aware; suspicious resubmission |
| `lib/checks/arithmetic.ts` | subtotal + tax + shipping + other = total; lines sum to subtotal |
| `lib/checks/balance.ts` | opening + Σ(credit−debit) ≈ closing |
| `lib/checks/statement-periods.ts` | Missing month in a statement series, per account |
| `lib/checks/tax-consistency.ts` | subtotal × rate-in-force vs extracted tax |
| `lib/checks/vat-number.ts` | Supplier VAT number against the jurisdiction's registration pattern |
| `lib/health/checks/benford.ts` | Benford leading-digit chi-squared deviation across ≥~100 invoice totals |

### Touchless-AP gates (7, registry-driven)

`lib/gates/registry.ts`, `lib/gates/index.ts`; rows in `prisma: Gate` with `gate.blocked`/`overridden`/`resolved` audit events.

1. `duplicate.ts` — hard. Same supplier + invoice no., or same total + date ±3d.
2. `jurisdiction-validity.ts` — hard. Runs the active pack's `invoiceValidity` rules; full vs abridged by threshold; cites the pack's `sourceRef` verbatim.
3. `match-variance.ts` — soft, tunable. 2/3-way total variance vs `max(percent × PO total, floor)`.
4. `supplier-trust.ts` — soft. Unverified supplier over threshold; clears on admin `verifiedAt`.
5. `confidence-band.ts` — soft. Per-amount-band confidence floors (0–500/0.85, 500–5k/0.92, 5k+/1.00); re-evaluation sweeps on config change; overrides never silently rewritten.
6. `warn-checks.ts` + `warn-checks-evaluator.ts` — soft, **workspace-authored rules in a hand-rolled safe expression language** (no eval, no sandbox, parse errors surfaced at save time, bounded execution). Admin UI `/automation/warn-checks`.
7. `smb-ceiling.ts` — hard, SMB-only. Bills > 10,000 base currency on a zero-Reviewer workspace; auto-resolves when a Reviewer is added, retroactive re-eval when the last one leaves.

### Automation, readiness, approvals, review

| Capability | What it does | Where |
|---|---|---|
| Graduated autonomy | Suggest → Auto-with-approval → Touchless, per workspace, owner-only | `prisma: WorkspaceAutomationConfig` |
| Readiness evaluation | Returns "ready to sync" or every blocker with a machine code (`low_confidence:<field>`, `check_failed`, `duplicate`, `budget_exceeded`, `supplier_cold_start`, `qa_sample`, …) | `lib/readiness/evaluate.ts` |
| Per-supplier trust ladder | New supplier held at 0.98; steps down after N consecutive clean touchless docs; **first N docs from ANY supplier always reach a person** | `lib/readiness/supplier-thresholds.ts` |
| Amount-band floors | Lower floor for small low-risk amounts, verified-supplier bands | `lib/readiness/amount-band.ts` |
| Recurrence detection | Monthly (25–35d) or weekly (5–9d) cadence + amount within ±2% ⇒ touchless candidate | `lib/readiness/recurrence.ts` |
| QA sampling | A random sample of touchless-eligible documents pulled back for review anyway | `lib/readiness/evaluate.ts:225` |
| Supplier rule engine | Deterministic matcher + coding + hit stats + `minConfidence` escalation | `lib/automation/rules.ts` |
| Vendor coding history prior | 3 confirmed identical human codings at ≥90% agreement ⇒ apply it **instead of asking the AI** | `lib/automation/vendor-history.ts` |
| Coding / policy / approval-context agents | AI coding fallback with confidence scalar; AI evaluation of the workspace's written spend policy; approval-context summarisation | `lib/agents/*`, `prisma: AgentVerdict` |
| Budget engine | Per-vendor / per-category thresholds, integer-cent arithmetic, warn vs violate | `lib/budget/engine.ts` |
| **Approval workflows** | Multi-stage; per stage a role gate + **named approvers list** + **amount threshold** (stage skipped below it) | `lib/approvals/engine.ts` |
| Review routing rules | Priority-ordered rules → assignee | `lib/review-routing/engine.ts` |
| Keyboard-driven review queue | Split list/detail, URL-persisted status tabs | `components/workspace/review-inbox.tsx` |
| **Golden documents / reviewer quality** | Planted-error documents scored against reviewer submissions; reviewer-quality rollups | `lib/review/golden.ts`, `lib/analytics/reviewer-quality.ts` |
| Reminder engine | 48h-then-escalating nudges on pending review tasks and expense claims | `lib/reminders/engine.ts` |
| Expense claims | Group expense_receipts into a claim, optionally through an approval workflow | `prisma: ExpenseClaim` |
| Blocker → control deep-link | A readiness blocker code maps to the exact Controls tab owning the lever that caused it | `lib/documents/blocker-controls.ts` |

### Matching, suppliers, reconciliation

- **2-way and 3-way matching** — PO ↔ invoice ↔ receipt on vendor + amount (tolerance) + date proximity + PO number, per-signal reasons, confidence score, `Ditto`-style blocking over `DocumentFieldValue` instead of a fixed 200-row scan. `lib/matching/engine.ts`, `three-way.ts`, `blocking.ts`
- **Supplier registry + resolution** — one canonical `Supplier` row; exact normalized key → known alias → token-set fuzzy (≥0.92 auto, 0.80–0.92 show a person); **shared IBAN as dedup anchor**; learns new spellings. `lib/suppliers/alias.ts`, `normalize.ts`
- **Alias mining from corrections** — a supplier field overridden the same way ≥2× becomes a confirmed alias. `lib/suppliers/mine-aliases.ts`
- **Active-learning threshold tuning** — samples least-confident pairs for labelling, then picks thresholds maximising recall at a fixed false-merge tolerance. `lib/suppliers/active-learning.ts`
- VIES EU VAT lookup behind `VIES_ENABLED`. `lib/suppliers/vies.ts`
- **Bank matching** — descriptor→counterparty normaliser (strips `PAYPAL *`, `SQ *`, txn ids, dates, locations); **bounded subset-sum many-to-one** matching (one deposit = N invoices net of fees); **PSP payout decomposition** (Stripe/PayPal net deposit → gross − refunds − fees); match memory. `lib/bank-match/*`
- **Reconciliation loop closure** — accepting a bank match marks the document paid and writes the ledger side atomically. `lib/reconciliation/close-loop.ts`
- Supplier statement reconciliation. `lib/reconciliation/supplier-statement.ts`

### Ledger, integrations, payments

- **Built-in double-entry ledger** = a self-hosted, DocuBite-themed **Bigcapital** instance, auto-provisioned per workspace, reached by SSO handoff. Owns debits/credits, chart of accounts, and reports (trial balance, GL, AP/AR aging) which flow into worksheets. `docs/architecture/adr-001-bigcapital-is-the-ledger.md`, `lib/integrations/bigcapital/*`. ⚠️ Gated on `BIGCAPITAL_ENABLED` (false by default, `true` in `.env.production.example`).
- **QuickBooks Online + Xero connectors** — OAuth connect/callback, encrypted token storage with rotation, refresh, rate limits, preflight, push policy with 5-attempt cap, per-stage push tracking, push-divergence detection. `lib/integrations/quickbooks|xero/*`, `lib/integration-push.ts`
- **Bill mapping** — per-provider mappers with line-item rounding reconciliation so lines sum exactly to the header total after FX conversion. `lib/integration-bill-mapping.ts`
- **Chart-of-accounts sync + category mapping** — `AccountingEntity` cache, `CategoryAccountMapping`, `CategoryNature` (goods vs services), account-option picker, COA drift detection. `lib/integrations/sync.ts`, `lib/health/checks/coa-drift.ts`
- **AP aging cockpit** — every extracted invoice bucketed by days past due, payment status from ledger sync, blocked-by-check flag. `app/(app)/…/(chrome)/bills/page.tsx`. ⚠️ **Not in the sidebar** — reachable only from `/close` and pipeline stage headers.
- **Payment run (pay-ready, never pay-executing)** — ZA EFT CSV accepted by Standard Bank / Absa / Nedbank / FNB bulk-payment portals; explicitly *not* a BankservAfrica ACB scheme file. `lib/payments/za-eft-csv.ts`
- ⚠️ **Remittance advice is generated but never delivered.** `models/payment-runs.ts:78,111` builds per-supplier advices and returns them; `app/(app)/…/bills/actions.ts:20` destructures only `{ run }` and redirects to the CSV download, which regenerates the CSV alone. The module's own comment concedes they are plain text: "PDF generation is a future concern." **Half-built.**
- ⚠️ Payment-run format is **ZA-only**. No GB/EU/US bank file exists.

### Multi-currency

- Rate anchored to **the document's own date**, frozen on the row so dashboards and ledger pushes always agree; Frankfurter (ECB reference, historical to 1999) with optional FastRates for same-day; source recorded (`frankfurter` / `fastratesapi` / `frankfurter+triangulated` / `identity`). `lib/fx/rates.ts`
- **CMA pegs handled natively** — LSL/NAD/SZL substituted with ZAR anchor before every fetch and cache write, stamped `+pegged_via_ZAR` so an audit can distinguish a real rate from the proxy. `lib/fx/rates.ts:21-40`
- **FX-pending blocks the ledger push** — a foreign-currency document with no `baseCurrencyTotal` is rejected before payload construction. `integration-push-actions.ts:74-84`
- Zero-decimal currency handling (JPY etc.). `lib/fx/apply-to-document.ts`, `lib/money.ts`

### Jurisdiction, tax, close

- **Jurisdiction packs** — one directory per code with invoice-validity rules, input-tax treatment, filings, retention, thresholds, border rules, workpapers, stable `packVersion`. `lib/jurisdictions/types.ts`
- ⚠️ **Only two packs exist: ZA and LS.** `GB` and `US-CA` are in `JURISDICTION_CODES` but have no pack file and are hidden from the picker. `lib/jurisdictions/index.ts:16,31-34`
- **Tax rate regions** (separate, retroactive rate snapshots): `lib/tax/regions/{za,ls,gb,us}.ts`; `prisma: TaxProfile`, `TaxProfileVersion`
- **VAT workpapers** — shared compute substrate; ZA VAT201, LS VAT-12 (reconciliation tab + return-form tab as a group); LS RSA cross-border review enforcing the SARS/RSL 10-digit `4…` VAT number and 90-day window. `lib/jurisdictions/_shared/*`
- **Monthly close checklist** — `openClose` materialises per-jurisdiction item descriptors; lock/reopen/relock; **lock is blocked while any hard-severity Gate is open**; per-item sign/unsign/override with a **versioned attestation text** kept on historical audit rows; deterministic prose preamble built server-side (no model call, cannot hallucinate a number). `lib/close/*`
- **Close computations**: AP aging + open exceptions, bank recon (asserted soft delta), **unposted-bill accrual journal drafts** (Dr category / Dr VAT suspense / Cr accruals, with auto-drafted reversal for periodEnd+1 — never posts), VAT workpaper, LS cross-border review. `lib/close/compute/*`
- ⚠️ Close bank recon is "awaiting assertion" — v1 has no ledger-side balance wired.

### Worksheets / spreadsheet

- **Univer-backed spreadsheet** (`@univerjs/presets` 0.25.1) — documents land as rows, real formulas, per-tab CSV / whole-book XLSX export, xlsx/csv import, seeding from reviewed extractions, writeback to documents, derived columns, cell→source provenance. `components/sheet/*`, `lib/sheet-*.ts`
- **`=AI()` custom function** — spreadsheet-native, fills down a column, cached so recalculation is free. `lib/ai-formula.ts`, `prisma: AiFormulaCache`
- **Natural-language formula builder** — describe the calculation, get the formula plus a one-sentence explanation; nothing lands until Insert. `components/sheet/formula-builder.tsx`
- **AI Assistant with pending-changes bar** — 7 sheet tools, Undo/Accept before anything sticks; four surfaces (`sheet`, `dictation`, `finance-inbox`, `close`). `components/assistant/assistant-panel.tsx`
- **Ledger reports into sheets** — Bigcapital trial balance / GL / AP-AR aging rendered as a worksheet. `lib/integrations/bigcapital/report-mapper.ts`
- ⚠️ **Stale documentation**: `components/sheet/README.md` declares the directory deprecated and unwired from navigation, and `adr-001` repeats it. Both are **wrong** — the sidebar has Worksheets, and `/worksheets`, `/worksheets/[fileId]`, `/worksheets/[fileId]/sheet`, `/settings/templates`, the dashboard and 5 components all link into it.

### Folder report (deterministic, no AI)

Grouping by type + supplier, exact duplicates by checksum, near-duplicates by content, **period-gap detection in a monthly series**, per-document problems (totals that don't sum, missing required fields), each item opening the source at the offending value. Same folder ⇒ same answer. `lib/gap-report.ts`, `lib/dedupe.ts`

### Archive, search, RAG

- **Hybrid retrieval** — lexical + vector halves (24 candidates each) fused, optional reranking, snippet extraction with page + 0–1 bbox for citation, audit-recorded. `lib/retrieval.ts`, `lib/rerank.ts`
- **Query router** — narrows a natural-language query to structured field filters; **can only narrow, never break or force** — every failure path degrades to unrouted search. `lib/query-router.ts`
- **Chunking + embeddings** — provenance-carrying chunks; embed job queued off the OCR text alone, so a document is searchable even when LLM field extraction fails. `lib/chunking.ts`, `lib/document-embedding.ts`
- **Archive with facets + graceful degradation** — when embeddings are off, search returns `degraded: true` and falls back with a visible notice rather than an empty result. `lib/library-search.ts:81-103`
- Global search + structured field search. `lib/global-search.ts`
- ⚠️ Gated on `EMBEDDINGS_BASE_URL`, empty in `.env.production.example`. `RETRIEVAL_ROUTER_ENABLED` and `RERANK_BASE_URL` unset everywhere.

### Dictation / ASR

Recording → transcription → embedding-based semantic intent routing (router can only narrow) → command/content separation → field extraction → report rendering: **deterministic synoptic block** (no LLM; a missing slot renders a visible `[missing: label]` marker) plus LLM narrative sections constrained to what was dictated. Verify screen puts audio, transcript, fields and report side by side. `lib/dictation/*`, `lib/asr/*`, `lib/report-render/*`
⚠️ Requires `ASR_BACKEND` + key — **absent from `.env.production.example` entirely**. Deepgram and HuggingFace backends carry explicit "BAA needed before real patient audio" TODOs; HIPAA-mode workspaces gated by `lib/asr/gating.ts` against an admin-confirmed BAA. Effectively a healthcare-oriented feature in a finance-only product.

### Audit, security, compliance

- **Audit event writer** capturing actor + source IP + user agent + outcome (`success`/`failure`/`denied`) from one place, with hash-based payload dedupe; two entry points (request and worker context). `lib/audit.ts`
- **Append-only trail with 6-year retention** — `DocumentAuditEvent.workspace` is `onDelete: Restrict`, so a workspace delete **cannot** take its audit trail with it; `lib/audit-archive.ts` writes every row to cold storage outside the workspace's own prefix before clearing, ordered so the archive always lands first.
- **Activity feed + CSV export** — every member, no plan gate, GET-form filters so the page URL and the export query are one source of truth. `/activity`
- **Malware scan, fail-closed** — every upload scanned before it is rendered, stored for viewing, or sent anywhere; in production no verdict ⇒ no processing. `lib/malware-scan.ts`
- **Row-level security** — `lib/db-rls.ts`, `lib/workspace-scope.ts` (a query without a `workspaceId` filter throws), `DB_RLS_ENABLED`
- **Signed URLs / streamed source bytes** — browsers never talk to object storage; every view is authorised and streamed through the app. `lib/signed-url.ts`
- **Secret encryption + key rotation** — AES-256-GCM with `SECRETS_ENCRYPTION_KEY` / `_PREVIOUS`. `lib/secret-crypto.ts`
- MFA, idle session logoff, auth audit, auth rate limiting, Google SSO / identity linking. `lib/supabase/middleware.ts`, `lib/auth-audit.ts`, `lib/google-identity.ts`
- **Per-workspace AI kill switch** — `workspace.aiEnabled === false` ⇒ documents still arrive and are manually reviewable; nothing leaves the platform. `lib/document-processing.ts:405-410`
- CSP + report endpoint, Sentry PII scrubbing, SSRF/URL safety, prompt-injection safety, rate limiting. `lib/csp.ts`, `lib/sentry-scrub.ts`, `lib/url-safety.ts`, `lib/prompt-safety.ts`
- **Compliance documentation set** — HIPAA technical safeguards, NIST CSF 2.0 profile, policy set, evidence register, subprocessor register (`prisma: Subprocessor`), operational templates. `docs/security/**`
- **Link sharing** — public-link or per-email file sharing with `view` / interact / `edit` levels, no account needed; denied access audited as `shared_link_opened`/`denied`. `app/shared/[fileId]/page.tsx`, `models/files.ts::getFileAccess`

### Data Health (27 checks, scored)

Registry-driven pure-function checks over a plain-data context, rolled into a weighted 0–100 workspace score with per-check "nothing to say" handling. `lib/health/*`, `/health`

Phase A (pipeline): review-backlog, stale-documents, uncorrected-low-confidence, confidence-drift, rule-coverage, push-failures. Phase B (ledger): unreconciled-transactions, uncoded-transactions, control-account-postings, dormant-accounts, duplicate-contacts, ledger-duplicate, multi-coded-contacts, coa-drift, bank-reconciliation, contact-defaults-missing (⚠️ deliberate no-op). Phase C (tax): missing-tax, tax-mismatch, tax-consistency, vat-number-format. Phase D (informational): submission-volume, automation-rate, processing-time, reconciliation-rate. Plus `benford.ts`.

### Webhooks, API, analytics, admin

- **Signed webhooks** — 9 event types (`document.received`, `.ready_for_review`, `.needs_review`, `.reviewed`, `.failed`, `.deleted`, `bill.pushed`, `match.discrepancy`, `check.failed`), HMAC signature with timestamp tolerance, delivery policy with automatic redelivery, manual redeliver endpoint, delivery history UI. `lib/webhooks.ts`, `webhook-*.ts`
- **Workspace finance analytics** — spend by category, cash-flow trend, AP aging, read from the structured field projection (never product telemetry). `lib/analytics/workspace-analytics.ts`
- **Module catalog** — 24 modules with `always`/`default`/`optional` tiers, `requiresConfig` prerequisites, per-workspace toggles that hide features and never delete data; drives the sidebar. `lib/modules/index.ts`
- **Admin console** — generated next-admin surface plus analytics and BAA-coverage pages. `app/admin-next/*`
- **Workspace teams** — owner/member roles, email invitations with expiring tokens, per-user list preferences. `models/workspaces.ts`
- **Workspace home / next-action queue** — permission-filtered next-best-action with a "why this is first" explanation and a caught-up state. `CONTEXT.md`
- **Degraded-pipeline UX** — permanent vs transient failure copy, per-code action text, bulk retry, exactly one notification to the email sender of a terminally failed document. `lib/document-error-copy.ts`

### Flagged: dark, off-by-default, dead, or stale

| Item | Status |
|---|---|
| Inbound email intake | **Dark in production** per templates — no DNS/provider provisioned; route 503s |
| Page-level retrieval | Off (`DOCUMENT_PAGE_RETRIEVAL` unset everywhere) |
| Retrieval query router | Off (`RETRIEVAL_ROUTER_ENABLED` unset) |
| Reranking | Off (`RERANK_BASE_URL` unset) |
| Dictation semantic router | Off (`DICTATION_ROUTER_ENABLED` unset) |
| ASR / dictation | No ASR vars in `.env.production.example`; BAA TODOs outstanding |
| Embeddings / semantic Archive | Empty in `.env.production.example`; graceful degradation exists |
| Image pre-normalisation | Off by default |
| Bigcapital built-in ledger | `BIGCAPITAL_ENABLED=false` default, `true` in prod example |
| GB and US-CA jurisdiction packs | Listed, not shipped |
| `/bills` AP aging cockpit | Real page, **not in the sidebar** |
| Remittance advice | Generated, **never delivered to the user** |
| `contact-defaults-missing` health check | Intentional permanent no-op |
| Close bank recon | "Awaiting assertion" — no ledger balance wired |
| Billing / plans / trial | `lib/plans.ts` is a stub returning "unlimited"; **no Stripe checkout, no billing route, no trial timer**. Only real limit is a **200 MB per-workspace storage cap** (`lib/config.ts:295`, `models/documents.ts:110-116`) |
| `components/marketing/sections/**` (14 files) | Dead code, contradicts the live site |
| `lib/solutions.ts::PRODUCT_LINKS` | Dead data pointing at 4 anchors that no longer exist |
| `components/sheet/README.md`, `adr-001` §"Not built on" | **Stale** — declare the live spreadsheet deprecated |

---

## 2. What the marketing site claims

### Live homepage

- **`landing/hero.tsx`** — "Works with your books: or brings its own." · bills arrive by email, upload or API · "reads even the hard cases: **handwriting, phone photos and scans**" · "checks for the frauds nobody else looks for" · routes approvals · posts to QuickBooks, Xero **or your ERP**, or the built-in double-entry ledger · "Payment stays on your bank's rails" · Start 14-day free trial · 30-day money-back guarantee · app mock with `£` amounts, `receipt-cafe.heic`, `scan_0043.jpg`.
- **`landing/reads-strip.tsx`** — Invoices · Receipts · Bank statements · **Handwritten notes** · Any custom PDF or image.
- **`landing/proof.tsx`** — Private encrypted storage · Any currency anywhere, historical FX built in · Data exportable · **"No long-term contract · Cancel at any time."**
- **`landing/how-it-works.tsx`** — In (Capture·Code·Check), Through (Match·Approve), Out (Sync·Pay-ready) · "One click assembles the **bank-ready payment file with per-supplier remittance advice**" · "does not move money, issue cards, hold funds… **works the same wherever in the world you bank**."
- **`landing/intake.tsx`** — drop a file or whole folder; mixed PDFs, phone photos and scans; multi-doc split · email it to your workspace, sender allowlist, shows `acme-9f3c@inbound.docubite.app` · zips unpacked, portal links followed, email-body-is-the-bill.
- **`landing/extraction.tsx`** — every field + per-field confidence, uncertain raised not guessed · **"The hard copies, not just the clean ones: Handwriting, faxes, a phone photo of a crumpled receipt. These are the expected input, not the edge case."** · line items with qty/price/tax · your document types, your fields.
- **`landing/provenance.tsx`** — click the number, see the page; document + page + exact spot.
- **`landing/folder-checks.tsx`** — batch grouped by type and supplier, near-identical copies paired, period gaps, per-document problems; **deterministic — same folder gives the same answer twice**.
- **`landing/pipeline.tsx`** — Inbox → To review → Ready · one workspace or one per client · owner/member roles · approval workflows.
- **`landing/automation.tsx`** — "It watches how you code, then stops asking" — three same-supplier codings, the fourth codes itself · Suggest / Auto-with-approval / Touchless · new suppliers must earn it · PO↔invoice↔receipt and bank-line matching · guards: confidence floor, amount bands, your written policy, a reviewed sample.
- **`landing/sheets.tsx`** — worksheets from reviewed extractions, built-in ledger reports, QBO/Xero statements, or any Excel/CSV · sort, add columns, AI Assistant writes a formula · CSV per tab / Excel per book · cell traces to source page.
- **`landing/accounting.tsx`** — post to QBO, Xero, your ERP as we add it, or the built-in full double-entry ledger (chart of accounts, journals, AP/AR, VAT, financial statements) · Sage/NetSuite marked Roadmap · duplicate guard travels with the push.
- **`landing/multi-currency.tsx`** — original currency, converted at the **invoice's own date** · live + historical **ECB** feeds back to 1999 · rates frozen · **CMA pegs native** · unlanded rate blocks the push.
- **`landing/library.tsx`** — Archive is the permanent record; **search by meaning; ask a plain question, answered from your own documents, cited to filename and page**; auditors get a link.
- **`landing/comparison.tsx`** — 200 mixed files at quarter-end · an error sitting in the data · "where did this number come from".
- **`landing/faq.tsx`** — reads invoices/receipts/bank statements/any custom PDF or image; **"Handwritten notes and low-quality scans are expected input"**; ≤50 MB; multi-page; split · private encrypted storage · owner/member roles, invitations, shared review queue, approval workflows, every change attributed · inbound email + allowlist + zips + portal links + body-as-PDF · autonomy ladder + 3-codings + cold start + confidence floor + amount bands + written policy + random sample · CSV export, QBO/Xero push, **bank-ready payment file with per-supplier remittance advice** · does not move money.
- **`landing/trial-cta.tsx` / `inline-cta.tsx`** — "Start with one messy folder"; **"Start your 14-day free trial — cancel anytime. Backed by a 30-day money-back guarantee."**

### Other live marketing pages

- **`/pricing`** — no prices (self-declared placeholder, with an internal "*do not fabricate figures here*" TODO). 14-day trial, 30-day money-back, "no long-term contracts."
- **`/solutions`** — By document type: Invoices, Receipts, Expense receipts, Bank statements, Purchase orders, Remittance advice, Contracts & forms, custom. By document **quality**: **Handwritten** · **Scanned PDFs** · **Phone photos** ("angled, low-light snaps, curled thermal paper") · **Long bundles**.
- **`/solutions/[slug]` × 9** — notable claims: "Fraud checks that Dext-class tools don't run" · "3-way matching wired end-to-end" · "named approvers and amount thresholds" · client-scoped inbound email · `POST /api/v1/documents` + 3 webhook events · aging cockpit · ZA EFT CSV + per-supplier remittance advice · **"Pages that local text extraction cannot read are sent down the vision path instead of failing"** · **"Faded thermal print still resolves… handled as a first-class case"** · **"Handwriting is not a special case… the parser that reads a laser-printed invoice reads a handwritten delivery note the same way"** · **"Skew, speckle and photocopy grey — third-generation photocopies and fax-quality scans are what the parser is built for"** · "Only text reaches the model."
- **`sections/workflow.tsx`** (live on every solution page) — "Every page is parsed to text — **print, scan or handwriting alike**" · low-confidence amber, missing required red · corrections kept separate from raw extraction · up to 100 a batch · share by link · XLSX/CSV export.
- **`/demo`** — "Bring your worst document. We will read it live" · "the invoice, receipt or **handwritten note** that everything else chokes on."
- **`footer.tsx`** — Privacy, Terms, Cookies, How we use AI, support email. Nothing else.
- **`app/docs/ai/page.tsx`** — "MinerU… reads it — **including scans, photographs, and handwriting** — and returns its text as markdown… The model receives text only."

---

## 3. Gap analysis

### (A) UNDERSOLD — real capability the site barely mentions

Roughly in order of commercial weight.

**A1. The seven-gate touchless-AP control plane, with a workspace-authored rule language.** `lib/gates/*` ships duplicate, jurisdiction-validity, match-variance, supplier-trust, confidence-band, SMB-ceiling **and a safe expression language a workspace admin can author their own soft gates in** (`warn-checks-evaluator.ts` — a hand-rolled recursive-descent parser, not eval, parse errors surfaced at save time, bounded execution). Gates re-evaluate on config change, auto-resolve when the condition clears, and never silently rewrite a human override. The landing reduces all of it to four bullet fragments under "What still stops it." *Why it sells:* every competitor's answer to "can we encode our own control?" is "file a feature request." This is also the strongest enterprise-procurement answer on the site, and it is invisible.

**A2. The close checklist with hard-gate-blocked period lock and versioned attestation.** `lib/close/*`. `lockClose` is **refused while any hard-severity gate is open**, so a period cannot be locked over an unresolved fraud freeze. Sign-off carries a versioned attestation text preserved on historical audit rows. The assistant's opening summary is built deterministically from stored values — **it cannot hallucinate a number**. Per-jurisdiction item sets. **Zero mentions anywhere.** *Why it sells:* this is what moves DocuBite from "document tool" to "month-end tool," and it is what a practice owner buys.

**A3. Unposted-bill accrual journal drafts with auto-drafted reversal.** `lib/close/compute/unposted-accruals.ts` proposes Dr category / Dr VAT suspense / Cr accruals per candidate bill with a reversal drafted for periodEnd+1 — and never posts. Not mentioned. *Why it sells:* it is the exact manual task that makes month-end long, and "drafts it, never posts it" is precisely the trust posture accountants demand.

**A4. Data Health — 27 scored bookkeeping-quality checks.** `lib/health/*`, `/health`. A weighted 0–100 score across pipeline hygiene (review backlog, stale docs, uncorrected low confidence, **extraction confidence drift per template over 30-day windows**, rule coverage, push failures), ledger hygiene (unreconciled, uncoded, control-account postings, dormant accounts, duplicate contacts, ledger near-duplicates, multi-coded contacts, **chart-of-accounts drift**), tax (missing tax, tax mismatch vs what the provider recorded, VAT number format) and **Benford's-law leading-digit analysis**. **Zero mentions.** *Why it sells:* a standalone product ("audit your books") nobody in the Dext/Hubdoc tier has, and the natural land-and-expand wedge for practices.

**A5. The fraud-control suite, named individually.** The hero says "checks for the frauds nobody else looks for" and never names one. The real list: **bank-detail change freeze** (hard fail — the payment-diversion vector), **split-invoice threshold crowding**, **PDF metadata forensics**, **text-layer-vs-OCR divergence** (invisible glyph swap), **new-vendor red flags**, **round-number spike + z-score outlier**, **suspicious resubmission**, **Benford's law**. Only the ap-controllers solution page names three. *Why it sells:* "checks nobody else runs" is an unfalsifiable brag; "an IBAN that silently changed freezes the bill" is a story a CFO retells.

**A6. Evidence-based confidence calibration and a targeted verification re-read.** The site shows confidence bars, implying the model's self-report. The reality is better: arithmetic identity reconciles ⇒ 0.99 *because the document corroborates itself*; verbatim in OCR text ⇒ ≥0.95; **a number appearing nowhere in the OCR text is capped at 0.7 regardless of how sure the model felt**; suspect fields get one focused re-read. *Why it sells:* it is the honest answer to "how do I know your confidence score means anything," and the only part of the extraction story that differentiates on accuracy rather than format coverage.

**A7. The bank-statement running-balance constraint solver.** `lib/extraction/balance-solver.ts` — anchored on printed opening/closing balances, **auto-corrects single OCR-confusable digit misreads** before confidence is computed, and flags rows it couldn't resolve. Not mentioned. *Why it sells:* the single most credible "we actually read bad scans" claim the codebase can make — and it is arithmetic, not a promise about a model.

**A8. Advanced bank matching: bounded subset-sum and PSP payout decomposition.** `subset-sum.ts` matches one deposit against a *set* of invoices net of fees. `psp-payout.ts` decomposes a Stripe/PayPal net settlement into gross − refunds − fees. `counterparty.ts` strips `PAYPAL *`, `SQ *`, `TST*`, txn ids, dates, locations. The landing gives bank matching half a sentence. *Why it sells:* "one deposit, five invoices, minus a fee" and "Stripe payouts reconcile themselves" are the two hardest reconciliation problems for the e-commerce/SaaS segment that pays most.

**A9. Supplier registry with automatic alias learning and active-learning threshold tuning.** Canonical supplier rows, exact→alias→fuzzy resolution with auto/review bands, **IBAN as dedup anchor** (same account = same payee whatever the name says), **aliases mined from reviewer corrections**, merge events, and active-learning sampling that tunes auto-merge thresholds against labelled pairs. Not mentioned. *Why it sells:* "Acme Ltd / ACME LTD / Acme Limited" is universal and universally hated; the self-tuning part is an uncommon engineering claim.

**A10. Provenance at row level, with honest degradation.** The site sells "click the number, see the page." The code also pins **every line-item row** individually, stores a match score, and **drops the rectangle to null below 0.55 rather than highlighting the wrong box**. Blocks are written to storage before extraction, so provenance survives an extraction failure. *Why it sells:* the failure mode *is* the trust story. Competitors highlight confidently and wrongly.

**A11. Append-only audit trail with 6-year cold-storage archival, enforced by a DB constraint.** `onDelete: Restrict` means a workspace delete cannot take the audit trail with it; the archive write is ordered to land first. Actor + IP + user agent + outcome captured in one place, plus `/activity` and CSV export for every member with no plan gate. The live site gives this one FAQ clause; the `sections/security.tsx` band that carried it is dead code. *Why it sells:* this is the procurement-questionnaire section, and the site has no security page at all.

**A12. Security posture and compliance documentation.** Malware scan that **fails closed in production**, per-workspace **AI kill switch** (extraction degrades to manual entry, nothing leaves), row-level security with a query guard that throws on an unscoped query, KMS-encrypted storage with browser-never-touches-storage streaming, secret encryption with rotation, MFA, idle logoff, auth rate limiting, CSP with reporting, Sentry PII scrubbing, SSRF guards, prompt-injection safety, subprocessor register, and a full `docs/security/**` set. The live site offers "private encrypted storage" and "keys managed for you." *Why it sells:* nothing currently on the site would survive a mid-market security review; all the material to pass one already exists.

**A13. The public REST API + 9 signed webhook event types.** Workspace-scoped keys, HMAC signatures with timestamp tolerance, automatic redelivery, manual redeliver, delivery history UI. Mentioned only in one solution-page bullet and in the dead `sections/integrations-api.tsx` — whose own file comment reads "*Backend audit found real, shipped integrations the marketing site never mentioned.*" That comment is still true, and the component that fixed it is now dead. *Why it sells:* it unlocks the bookkeeping-practice channel and is table stakes against Dext.

**A14. File link sharing with an "interact" sandbox.** Public link or per-email, no account for the recipient, three levels including a live grid where nothing is saved, denied access audited. The live FAQ says "auditors get a link" once. `sections/sharing.tsx` (dead) had the whole story. *Why it sells:* it is the accountant↔client handoff, and the sandbox level beats "here's a PDF."

**A15. Worksheets: `=AI()`, the NL formula builder, and ledger reports as sheets.** `landing/sheets.tsx` covers the assistant in one clause and never mentions the **spreadsheet-native `=AI()` that fills down a column with cached answers**, the **plain-English formula builder that explains what it wrote before you insert it**, or that **ledger trial balance / GL / AP-AR aging render directly into a worksheet**. The dead `sections/ai-band.tsx` correctly identified three distinct AI surfaces.

**A16. Adaptive extraction, shape memory, and run diff.** Line-item columns discovered per document; every run saves a layout fingerprint so **the next similar upload is matched before any AI runs**; **run diff** reports which fields appeared, vanished, moved or changed versus last month. None of it is on the site. *Why it sells:* it answers "does this scale past one document," it is a cost story (matched before AI = free), and the run diff is a control nobody advertises.

**A17. Structured field projection as a queryable layer.** Every extracted value becomes a row with its own confidence, source and provenance, powering analytics, health checks, matching candidate blocking and structured search. Invisible. *Why it sells:* it is the architectural reason DocuBite can answer "spend by category" and "which templates are drifting" while a CSV exporter cannot.

**A18. Jurisdiction rule packs that cite their own source.** Invoice-validity rules with a `sourceRef` the UI quotes verbatim (SARS s20 etc.), full-vs-abridged thresholds, a no-invoice floor, input-tax treatment, filings, retention, border rules, VAT workpapers (ZA VAT201, LS VAT-12, LS RSA cross-border 90-day / 10-digit-VAT enforcement). **Nothing on the marketing site mentions jurisdictions at all.** *Why it sells:* for a ZA/LS buyer this is the entire reason to choose DocuBite over Dext, and it is the only genuinely hard-to-copy asset in the repo. See B1 — it is also the source of the biggest oversell.

**A19. Degraded-pipeline honesty as a feature.** `lib/document-error-copy.ts` distinguishes permanent from transient failures, gives per-code "what to do" copy, never claims a retry is coming when it isn't, and sends **exactly one** notification to the person who emailed a document that terminally failed. Plus the Archive's visible `degraded` notice instead of an empty result. *Why it sells:* "what happens when it goes wrong" is what every evaluator asks and no competitor answers on their site.

**A20. Expense claims, approval workflows with named approvers + thresholds, review routing, reminders, golden documents, reviewer-quality scoring.** The live site says "approval workflows for what needs a second pair of eyes." **Golden-document QA scoring of your own reviewers** is entirely unmentioned and unusual.

**A21. Module catalog — buy what you need without losing data.** 24 modules with tiers, prerequisite checks, per-workspace toggles that hide features and never delete data. Unmentioned. *Why it sells:* the honest answer to "this looks like a lot of product I don't need."

### (B) OVERSOLD / UNSUPPORTED

**B1. Global reach, while only South Africa and Lesotho are supported. Most serious.**
`landing/how-it-works.tsx`: "*works the same wherever in the world you bank.*" `landing/faq.tsx` repeats it. Every homepage mock is British — `£2,475.60`, Northwind Trading, EDF Energy, "VAT at 20%", Metro Bank.
**Reality:** `lib/ingestion.ts:54` calls `requireWorkspaceJurisdiction` on **every** intake path and throws without a `jurisdictionCode`. `lib/jurisdictions/index.ts:31-34` registers exactly **ZA** and **LS**; `GB` and `US-CA` have no pack file and are hidden from the picker. A UK visitor who signs up from that hero **cannot ingest a single bill**. The payment file is ZA EFT CSV only. The only invoice fixtures are ZA and LS. The product is a South-Africa-first AP system marketed with British pound mocks and a global promise.

**B2. Handwriting.** Claimed in `landing/reads-strip.tsx`, `landing/hero.tsx`, `landing/extraction.tsx` ("**These are the expected input, not the edge case**"), `landing/faq.tsx`, `lib/solutions.ts:144-155` (a whole page: "Handwriting that other extraction tools skip", "the parser that reads a laser-printed invoice reads a handwritten delivery note the same way"), `sections/workflow.tsx`, `/demo`, `app/docs/ai/page.tsx`.
**Reality:** the only support is `is_ocr: true` with `model_version: vlm` to hosted MinerU. `grep -i handwrit` across `lib/`, `app/`, `models/`, `ai/`, `worker/`, `prisma/` returns **only marketing copy** plus one incidental comment in `lib/sentry-scrub.ts`. **No handwriting fixture, sample, eval case or test.** No handwriting-specific prompt, confidence policy or fallback. The one piece of internal reasoning is a code comment, not a capability: "*MinerU's VLM backend copes with messy scans on its own*" (`lib/document-processing.ts:130`).
**Defensible instead:** "every page is parsed to text before extraction, so an image-only page is read rather than skipped"; "uncertain fields are raised, not guessed"; "the document itself never reaches the language model, only its text." **Not defensible:** that handwriting is *expected input*, *not a special case*, handled *the same way* as print, or that DocuBite reads handwriting others *skip*. The phrasing "the parser that reads a laser-printed invoice reads a handwritten delivery note the same way" is literally true of the code path and materially misleading about the outcome.

**B3. "Nothing is skipped for being low quality" / low-quality-scan handling.**
`sections/extraction-core.tsx` (dead), `landing/faq.tsx` (live: "low-quality scans are expected input"), `lib/solutions.ts:169` ("Skew, speckle and photocopy grey — third-generation photocopies and fax-quality scans are **what the parser is built for**"), `lib/solutions.ts:108-109` ("Pages that local text extraction cannot read are sent **down the vision path** instead of failing"; "Faded thermal print still resolves… **handled as a first-class case**").
**Reality:** **There is no vision path.** One path only: MinerU → markdown text → text-only LLM (`buildBatchParts` sends text parts only). `app/docs/ai/page.tsx` states this correctly, so the solutions page contradicts the site's own AI notice. **There is no quality assessment, quality score, degradation branch or poor-OCR fallback.** The image pre-normalisation that would help is **off by default** with the comment "enable when raw scan quality is provably hurting recall" — i.e. nobody has proven it, and it isn't on.
**And the failure path gives the wrong error:** `lib/document-processing.ts:439` throws `page_range_matched_no_pages` when no text comes back, so a genuinely illegible scan is reported as a **permanent** failure reading "The page range on this document matched no pages." There is no `document_unreadable` code. A user who uploads the crumpled receipt the hero invited gets a nonsense error about page ranges.
The only low-quality artefact in the repo is one synthetic sample (`samples/invoices/za-low-quality-scan.pdf`) whose own README calls it "*a probe, not a guaranteed trigger.*"
**What should carry this claim instead:** confidence calibration against the document's own evidence, the 0.7 cap on ungrounded numbers, the verification re-read, amount-banded gating, the balance solver's OCR digit correction, text-layer-vs-OCR divergence, and `uncorrected-low-confidence` + `confidence-drift` in Data Health. A genuinely strong story — about **catching** bad reads, not about **not having** them. The site promises the latter and ships the former.

**B4. "Phone photos" as a first-class capability.** `/solutions` ("angled, low-light snaps, curled thermal paper"), `landing/intake.tsx`, `landing/hero.tsx`. **Actually implemented:** HEIC/WebP acceptance and `sharp().rotate()` for EXIF orientation. No deskew, no perspective correction, no crop detection, no low-light handling (that pipeline is off by default). "We accept HEIC and won't render your photo sideways" is the honest version.

**B5. "14-day free trial · cancel anytime · 30-day money-back guarantee · no long-term contract."** On `landing/hero.tsx`, `proof.tsx`, `trial-cta.tsx`, `inline-cta.tsx`, `/pricing`, `sections/cta-band.tsx`.
**Reality: there is no billing system.** `lib/plans.ts` is an explicit stub — "*That system is gone — everything is unlocked for every workspace*" — returning `UNLIMITED_PLAN` with `price: 0`. No `/billing` route, no checkout route, **no Stripe SDK import** (env vars exist; nothing imports a client), no trial start/expiry field, no cancellation flow. **There is nothing to cancel and nothing to refund.** The one real constraint is a **200 MB per-workspace storage cap** that hard-refuses uploads with `free_trial_storage_exceeded` — never mentioned on the site.

**B6. "Per-supplier remittance advice" as a deliverable.** `landing/how-it-works.tsx`, `landing/faq.tsx`, `trial-cta.tsx`, `lib/solutions.ts:79`. Advices are built (`models/payment-runs.ts:78`) and returned (`:111`) — then **discarded** by the only caller (`bills/actions.ts:20` destructures `{ run }` and redirects to the CSV download, which regenerates the CSV only). The module concedes they are plain text: "PDF generation is a future concern." Half-built.

**B7. "One click assembles the bank-ready payment file."** The page that does it (`/bills`) is **not in the sidebar** — reachable only from `/close` and two pipeline stage headers. Owner-only, and takes whatever `documentId`s the form posts, while `lib/solutions.ts:79`'s "Select bills" implies a selection UI. ZA-format only (B1).

**B8. "Email it to your workspace", with a concrete address.** `landing/intake.tsx` prints `acme-9f3c@inbound.docubite.app`; `landing/faq.tsx` devotes a whole answer; `hero.tsx` and `how-it-works.tsx` **lead** with "Bills arrive by email." Per the templates the feature is **dark in production** (`lib/config.ts:233-240`; route 503s; `EMAIL_INBOUND_SECRET` unset in all three env files). The in-app settings page is honest — "Not yet active on this deployment" — so a trial signup reads the landing page, then reads the contradiction inside the product. The domain also mismatches: config defaults to `inbound.docubite.com`, the landing shows `.app`. **Verify against production in [163](https://github.com/petrose99/docubite/issues/163) before acting** — this repo's working notes record inbound email as live via Cloudflare, which the env templates would not show.

**B9. "Ask a plain question and DocuBite answers from your own documents, each answer cited."** `landing/library.tsx`, a full section with a mock. Depends on `EMBEDDINGS_BASE_URL`, **empty in `.env.production.example`**. Without it Archive degrades to keyword fallback with a `degraded` notice — good engineering, not the same as the claim holding. Reranking and the query router are off everywhere. Same caveat as B8: verify against production.

**B10. "Sage · NetSuite · more" and "your ERP as we add it."** `landing/accounting.tsx` marks Sage/NetSuite as Roadmap, which is honest. `landing/hero.tsx`'s "posts to QuickBooks, Xero **or your ERP**" is not — three providers exist: `bigcapital`, `quickbooks`, `xero`.

**B11. Multi-currency "ECB reference" attribution.** `landing/multi-currency.tsx` credits "live and historical ECB reference feeds" and labels a row "live intraday." Actual providers: **Frankfurter** (a free ECB wrapper — accurate) and optional **FastRates** for same-day. Intraday comes from FastRates, which is not ECB, and `FASTRATES_API_KEY` is optional and unset in the production template — so "live intraday" is the weakest part of an otherwise well-supported section.

**B12. The dead `sections/` tree is a liability.** If resurrected: `sections/faq.tsx` tells visitors there is **no ledger, no reconciliation, no automatic posting** and that **email-in is not available**, contradicting current positioning. `sections/extraction-core.tsx` carries B3's claim. `PRODUCT_LINKS` points at four anchors that no longer exist.

### (C) ACCURATE BUT THIN

- **C1. "It checks for the frauds nobody else looks for."** One clause for eight named, implemented, individually explainable controls (A5). The strongest sentence on the site, and it names nothing.
- **C2. Folder checks.** True, and "the report is deterministic: the same folder gives the same answer twice" is a good line. Thin: it never says the report is **free** (no AI cost) and runs **before any model call** — which the dead `sections/folder-report.tsx` did say ("*It's arithmetic, not AI — free, deterministic, and there every time*") and which is the actual buying argument at pile scale.
- **C3. "It ties the paperwork together."** One `<dd>` for 2-way and 3-way matching with per-signal tolerances and exact deltas, blocking-based candidate generation, subset-sum and PSP-payout bank matching, and reconciliation loop closure. Three product areas in one sentence.
- **C4. "Approval workflows for what needs a second pair of eyes."** The real thing has **named approvers per stage** and **per-stage amount thresholds that skip the stage below them**, plus priority-ordered routing and escalating reminders. The ap-controllers solution page says this properly; the homepage doesn't.
- **C5. Provenance.** True; omits row-level pinning for line items, the match-score honesty (approximate rather than wrong), the stale-pin drop on hand-edit, and that provenance survives an extraction failure.
- **C6. Teams and review.** True; omits the keyboard-driven split-pane queue, routing rules, reminder escalation, golden-document QA, reviewer-quality rollups, and link sharing with the interact sandbox.
- **C7. "Reviewed data streams out as CSV."** True; omits whole-book **XLSX**, xlsx/csv **import**, the activity-log CSV export, the REST API and the 9 webhook events. "Nothing here is a one-way door" is right and undersupported.
- **C8. The built-in double-entry ledger.** Supported. Thin the other way: doesn't say ledger reports render **into your worksheet**, doesn't say provisioning is automatic per workspace, and — a disclosure question worth raising — doesn't say it is a self-hosted, white-labelled **Bigcapital** instance (`THIRD_PARTY_NOTICES.md`).
- **C9. The four automation GUARDS.** All real. Four bullets carrying a 7-gate control plane plus a workspace-authored rule language.
- **C10. "Define what an invoice means in your business."** True and well put; omits that the first document **proposes** the field set, that repeat layouts are **matched before any AI runs**, that line-item columns are discovered adaptively, and that templates are **versioned** with a run diff.
- **C11. "Files up to 50 MB, multi-page included."** Accurate. Silent on `DOCUMENT_MAX_PAGES`, the 100-file batch limit (stated only in dead files), and the **200 MB workspace storage cap that will stop a trial user first**.
- **C12. "Deleting the workspace deletes them."** True for documents, and **deliberately not true for the audit trail**, archived for 6 years by design. Thin to the point of slightly wrong — and the retention commitment is a selling point, not something to hide.

---

## 4. Proposed Product menu clusters

A proposal for [164](https://github.com/petrose99/docubite/issues/164) to decide, not a decision. Group names are labels, not final copy.

**1 · Read the document** — parse-to-text for scans and image-only PDFs (the defensible core of B2/B3) · evidence-based confidence calibration and the verification re-read (A6) · the bank-statement balance solver (A7) · adaptive line-item schema, shape memory, matched-before-AI (A16) · run diff (A16) · custom worksheets, versioned (C10) · row-level provenance and honest degradation (A10, C5) · multi-page batching, auto-split, continuation-row merging.

**2 · Controls & fraud** — *the differentiator; deserves the strongest page on the site.* The eight named fraud checks, led by the bank-detail change freeze (A5) · the seven touchless gates (A1) · **write your own rules**: the warn-check expression language (A1) · graduated autonomy (C9) · supplier trust ladder, cold start, amount bands, QA sampling (A20, C9) · approval workflows with named approvers and thresholds (C4) · review routing, reminders, golden-document reviewer QA (A20) · every blocker deep-links to the control that caused it (A19).

**3 · Close the books** — *currently zero marketing surface; should be a peer of Extraction.* The monthly close checklist (A2) · period lock blocked by open hard gates, versioned attestation (A2) · unposted-bill accrual drafts with auto-reversal (A3) · AP aging cockpit (also fixes B7's navigation gap) · bank matching: subset-sum, PSP payouts, counterparty normalisation, loop closure (A8) · supplier registry, alias learning, active-learning thresholds (A9) · multi-currency with date-anchored frozen rates and CMA pegs.

**4 · Books & data quality** — *Data Health is a product; give it a page.* The 0–100 score (A4) · pipeline hygiene incl. **extraction confidence drift** (A4) · ledger hygiene incl. **COA drift** (A4) · tax checks (A4) · Benford's law (A4, A5) · financial analytics from the structured field projection (A17).

**5 · Connect & extend** — post to the built-in ledger, QBO or Xero (C8) · chart-of-accounts sync, category mapping, goods-vs-services nature · REST API v1 with workspace-scoped keys (A13) · 9 signed webhook events with redelivery and delivery history (A13) · worksheets: `=AI()`, the NL formula builder, the assistant with Undo/Accept (A15) · ledger reports into a worksheet (A15) · export per-tab CSV, whole-book XLSX, activity CSV; import xlsx/csv (C7) · link sharing: view / interact sandbox / edit (A14).

**6 · Trust** — *outside Product: a procurement destination, not a feature.* Append-only audit trail, 6-year archival enforced by a DB constraint (A11) · malware scan fails closed, per-workspace AI kill switch (A12) · row-level security, KMS encryption, browsers never touch storage (A12) · MFA, SSO, idle logoff, rate limiting, secret rotation (A12) · what reaches a model and what never does (A12, the honest half of B3) · compliance posture (A12) · **jurisdiction rule packs that cite their source (A18) — and the place to state the ZA/LS scope honestly, fixing B1.**

**Two cross-cutting notes.** `PRODUCT_LINKS` is already a dead attempt at this menu (Document extraction · AI in the sheet · Folder reports · Integrations & API · Security) — broken anchors, and missing Controls, Close and Health, the three strongest clusters. And several of these pages **cannot be written honestly until [161](https://github.com/petrose99/docubite/issues/161) (jurisdiction scope) and [162](https://github.com/petrose99/docubite/issues/162) (trial/pricing) are resolved**, because a Close or Controls page must say which jurisdictions and which plan.

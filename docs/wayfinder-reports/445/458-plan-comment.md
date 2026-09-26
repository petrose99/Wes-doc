Autopilot: plan (plan gate, map Notes) — spec done, build starts next session. The owner's delegation takes the recommended answer, so build proceeds unless the owner objects here.

Spec: `docs/wayfinder-reports/445/458-spec.md` · pre-flight: `458-preflight.md` · spec critic (opus): `458-critic.md` — 30/40 and 7 P1s as first written, all fixed in the spec's second revision (reconciled 32/40, health ≈ 88, verdict Clean).

Build steps (one per session; the ticket's 1–5 re-sequenced so each fits a session and the push gate has its inputs):
1. **Ledger capabilities** (backend) — one additive migration for every new column; `lib/integrations/ledger-capabilities.ts` (QBO CompanyInfo + Preferences, Xero TrackingCategories). If the VAT setting can't be read, nothing is posted.
2. **Reference sync** (backend) — Class, Department (Location), Customer, tax rates with TaxType / purchase flag / percent, and each account's default tax code.
3. **Supplier rules learn the set + line/bill coding model** (backend) — Tax code, Tracking, Customer, Billable on each line; Location and Tax basis (inferred) on the bill. Pre-fill never fills a value the ledger can't take.
4. **Snapshot + blocking Checks + eligibility + push gate + QBO 5030** (backend) — the 11 Checks from the Q6 table. Every fail blocks posting. Checks refresh on Save review and on sync.
5. **Mappers + post read-back + correction resend test** (backend).
6. **Accounting › Supplier accounts shows the full set** (surface) — Tax code, Tracking and Location under the usual account. Forget now asks for confirmation, with its consequence spelled out.

Then G1 (round script, 6 states × 1440/390) · G2 (r0 and fixes) · G3 (build-done).

Open engineering question, not a design gap: QuickBooks' TaxInclusive line-amount semantics are unverified. The post read-back warning is the guard.

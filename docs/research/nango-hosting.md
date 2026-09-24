# Nango hosting — self-host vs Cloud

Research for Wayfinder ticket #377 (map #376, ledger connections via Nango). Sources: nango.dev/docs (official docs, current as of 2026-09-22), nango.dev/pricing, GitHub NangoHQ/nango.

## Free self-hosted (open source) tier

Per Nango's own self-hosting comparison table (nango.dev/docs/guides/platform/self-hosting):

> "A limited free self-hosting option is available for hobby projects, separate from BYOC and Self-Managed."

- Included: **Auth + Proxy only**.
- Excluded: **webhooks, syncs, triggers, tool calls**, OpenTelemetry export, RBAC/MFA/audit trail/SAML SSO, pre-built integrations catalogue, MCP server, full observability.
- The doc explicitly labels free-tier observability as "Auth + proxy only" vs "Full" on Enterprise/Cloud.

This is decisive: **connection webhooks for auth failures — the mechanism ticket #382 (token-failure detection) needs — do not exist on the free self-hosted tier.** A self-host on the free tier would force DocuBite back onto its own polling/probe for broken connections, which is exactly the operational burden Nango was brought in to remove.

## Enterprise self-hosted (BYOC / Self-Managed)

> "Both run the same Nango codebase you get on Cloud, with all paid Cloud features included."

- **BYOC**: Nango deploys and operates the instance inside DocuBite's own AWS/GCP project; only Datadog telemetry leaves the environment.
- **Self-Managed**: DocuBite deploys and operates it.
- Full feature parity with Cloud (webhooks, syncs if ever wanted, SOC 2, SAML SSO, HIPAA add-on).
- Priced as a fixed annual license + maintenance fee, on top of infra DocuBite runs — no published number; a sales conversation.

## Nango Cloud pricing (nango.dev/pricing, fetched 2026-09-22)

| Tier | Price | Connections | Overage | Notes |
|---|---|---|---|---|
| Free | $0/mo | 10 | n/a | Auth, webhooks, UI components, logs, SOC 2 Type II — all included even at Free |
| Pay-as-you-go (Starter) | $50/mo base | usage-based | ~$0.29–$1/connection/mo (sources vary; docs page quoted $0.29, search aggregator quoted $1 with 20 included) | All Free features |
| Growth add-on | +$450/mo | — | — | Faster (5-day) new-integration delivery |
| Enterprise | custom | — | — | Self-hosting/BYOC, SAML SSO, HIPAA, SCIM, audit trail, SLAs |

At the map's target scale (50–500 companies = connections), Cloud lands roughly **$50–$500+/month**, all-in, with webhooks, SOC 2 Type II and Connect UI included from the Free tier up — i.e. DocuBite does not need to leave the Free/Starter Cloud tier's feature set to get what the map's scope (auth + proxy only) requires.

## Data residency

- Nango Cloud runs in Nango's own infrastructure/regions; no dedicated EU or ZA region is confirmed in current docs or pricing material. Tokens for a South African company connecting on Cloud would live outside South Africa (US/EU, per Nango's published regions).
- Region pinning / in-country hosting is only available via Enterprise BYOC (deploy inside DocuBite's own cloud account, in whatever region DocuBite chooses) or Self-Managed.
- This repo has no existing regulatory requirement on record (POPIA doesn't mandate in-country storage the way GDPR-adjacent regimes sometimes do for certain sectors) — flagged as a gap for a later ticket if a compliance requirement surfaces, not a blocker now.

## Operational cost of self-hosting

- Self-hosting (free or Enterprise Self-Managed) means DocuBite's own team owns uptime, scaling, security patches, connector updates, and SOC 2 evidence collection if ever needed.
- This repo just deleted Bigcapital specifically because it was a self-hosted service DocuBite had to operate for no benefit (map #376 Notes: "Bigcapital is deleted, not unplugged"). Standing up another self-hosted service (even the free tier) re-creates the same category of operational load this map is removing, and the free tier doesn't even carry the webhook capability the map's later tickets need.

## Current version / SDKs

- Nango application: v0.71.7 (managed release 1.6.12), released 2026-09-17.
- `@nangohq/node`: 0.70.8 (npm, latest at fetch time).
- `@nangohq/frontend`: 0.71.4–0.71.6 (npm, latest at fetch time).
- DocuBite would pin `@nangohq/node` (server-side proxy calls, connection management) and `@nangohq/frontend` (Connect UI's underlying session flow, used only to learn the state model per the map's Notes — DocuBite builds its own UI, doesn't embed Nango's).

## Recommendation

**Nango Cloud, Pay-as-you-go (Starter) tier**, not self-hosted.

Reasons:
1. **Webhooks for auth-failure detection are not in the free self-hosted tier** — only Cloud (from Free tier up) or paid Enterprise self-host. Since the map's Notes already commit to "auth + proxy only" scope, Cloud's Free/Starter tier is a feature match; free self-hosting is not, because it lacks the one signal (webhook) ticket #382 is expected to use.
2. **Cost at scale is low and predictable** — $50–500/month for 50–500 companies, cheaper than the engineering time to operate a self-hosted service, and Cloud already includes SOC 2 Type II, which a self-hosted instance would have to earn on its own.
3. **Matches the precedent this map already set** — Bigcapital was deleted specifically to stop operating a self-hosted service for no upside; standing up Nango self-hosted to save the same operational cost Nango is meant to remove would be the same mistake in a new box.
4. **Enterprise self-hosting stays the documented fallback**, not the default: if a future compliance finding requires in-country token residency, BYOC in an AWS/GCP region of DocuBite's choosing gives full Cloud feature parity without leaving the platform.

## Capabilities this choice does NOT have (later tickets should not assume them)

- **No confirmed South Africa / dedicated EU data residency.** Tokens live in Nango's Cloud region (US/EU). If a later ticket needs in-country storage, it requires migrating to Enterprise BYOC, not a Cloud setting.
- **No infrastructure-level control** (network policy, VPC peering, custom patching cadence) — that is Enterprise/Self-Managed only.
- **Connect UI branding customization is a Growth-tier-and-up feature on some pricing summaries** — moot for DocuBite since the map's Notes already say "don't embed it," but any future decision to embed Nango's Connect UI directly would need to check tier gating again.
- **No SLA** below Enterprise — Free/Starter Cloud has no uptime guarantee; acceptable for a connect-and-proxy path with the map's own reconnect/notice handling as the safety net, but worth naming so a later ticket doesn't assume one.

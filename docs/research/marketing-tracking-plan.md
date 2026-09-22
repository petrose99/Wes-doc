# Marketing site tracking plan (map #312, ticket 04)

Tool: PostHog cloud (EU), **cookieless**. Scope: `app/(marketing)`, `app/(resources)`, `app/(auth)` only — the authenticated app never imports `lib/analytics.ts`.

## Privacy verdict
PostHog docs (posthog.com/docs/privacy/data-collection, checked 2026-09-19): `cookieless_mode: "always"` never writes cookies or local/session storage; visitors are counted by a server-side privacy-preserving hash; **no consent banner required** unless other site elements set non-essential cookies (this site sets only auth session cookies — see `/docs/cookie`). Caveats honoured: `identify()`/`alias()` are never called, `person_profiles: "never"`, no email or user id is sent, autocapture/session recording/surveys off. Not legal advice; the cookie policy page should gain one line naming PostHog before launch.

## Events
| Event | Trigger | Properties |
|---|---|---|
| `$pageview` | route change in any marketing/auth layout | `route` |
| `primary_cta_clicked` | click on any link to `/signup` (delegated, `components/analytics/marketing-analytics.tsx`) | `route`, `location` (nearest `data-track-location`, else nav/footer/body), `label` |
| `secondary_cta_clicked` | click on any link to `/demo` | same |
| `signup_started` | signup form submit, or Google signup button click | `method` password\|google |
| `signup_completed` | `signUpAction` succeeded (account created, email confirmation pending) | `method`, `stage` |
| `demo_requested` | `submitDemoRequest` returned ok | `volume` |

Known limit: cookieless has no cross-visit identity, so signup_completed means "account created", not "email confirmed", and a CTA click cannot be joined to a later signup per person — funnels are same-session only. Google signup completion is not tracked (that callback lives in the shared sign-in path); add when the auth code is next touched.

## Keys and plumbing
- `NEXT_PUBLIC_POSTHOG_KEY` (project API key, public by design) in `.env` / production env; empty = analytics fully off. Optional `NEXT_PUBLIC_POSTHOG_UI_HOST`.
- Events go via same-origin `/ingest` (rewrites in `next.config.ts` → `eu.i.posthog.com`), so CSP `connect-src 'self'` is unchanged. Use the US hosts in the rewrites if the project is US-region.

## Wizard verdict (owner's `npx -y @posthog/wizard@latest warehouse`, checked 2026-09-19)
`wizard --help` (latest): `warehouse` is a separate subcommand — "Detect and connect Data Warehouse sources" (scans deps/env for Postgres, Stripe, … and links them to PostHog's data warehouse). It is **not** the install and is not intended here: the marketing site needs only web events; connecting the production Postgres to PostHog would ship post-login data out of scope of this ticket. The install is the bare `npx @posthog/wizard@latest` (default command), which rewrites the integration into its own pattern (instrumentation-client, autocapture on, cookies) — redundant with and looser than the hand-written cookieless setup in `lib/analytics.ts`. Both forms need auth (`--api-key phx_…` personal key, or a browser OAuth login), so neither runs unattended. Decision: skip the wizard; the only missing piece is a project API key (`phc_…`) in `NEXT_PUBLIC_POSTHOG_KEY`. Owner can either paste the key, or run `npx @posthog/wizard@latest provision` (headless account/project creation, prints keys) and paste the project key.

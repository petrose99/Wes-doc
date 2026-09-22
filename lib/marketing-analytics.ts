import posthog from "posthog-js"

/** Conversion events for the marketing and auth route groups only — the authenticated app never
 * imports this. Cookieless: nothing is written to cookies or storage, and identify()/alias() are
 * never called, so no email or user id ever reaches PostHog. Tracking plan:
 * docs/research/marketing-tracking-plan.md. */
export type MarketingEvent =
  | "primary_cta_clicked"
  | "secondary_cta_clicked"
  | "signup_started"
  | "signup_completed"
  | "demo_requested"

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
let started = false

/** Idempotent; a no-op without a key so dev installs and forks stay silent. */
export function initAnalytics() {
  if (started || !KEY || typeof window === "undefined") return
  started = true
  posthog.init(KEY, {
    // Same-origin reverse proxy (next.config.ts rewrites) keeps the CSP connect-src at 'self'.
    api_host: "/ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://eu.posthog.com",
    cookieless_mode: "always",
    capture_pageview: false, // sent manually so SPA route changes carry the route
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    person_profiles: "never",
  })
}

export function track(event: MarketingEvent | "$pageview", properties?: Record<string, string | number | boolean>) {
  if (!started) return
  posthog.capture(event, properties)
}

import { basename, dirname, resolve } from "node:path"
import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"

// #361: an autopilot *-lanes/<map>-<ticket> worktree symlinks node_modules back to the main
// checkout (scripts/wayfinder-autopilot/README.md's LANE_LINKS) — pinning root to the worktree
// itself then makes Turbopack refuse that symlink as "points out of the filesystem root"
// (FATAL, dev server never listens on :3000). Pinning one level higher, the lanes' own parent
// directory, keeps both the worktree and the symlink's real target underneath root while still
// pre-empting the multiple-lockfiles warning below. A checkout that isn't a `*-lanes` worktree
// (the normal clone) is unaffected — root stays its own directory, same as before.
const here = import.meta.dirname
const turbopackRoot = basename(dirname(here)).endsWith("-lanes") ? resolve(here, "../..") : here

const nextConfig: NextConfig = {
  // Pins Turbopack's workspace root to this checkout, silencing (and pre-empting) the
  // multiple-lockfiles warning Turbopack prints when this project lives inside a git worktree:
  // its root-inference walks up looking for a lockfile and can find this repo's outer, non-
  // worktree checkout too (a package-lock.json exists in both). Not confirmed to be the cause of
  // any specific observed bug — the one dev-server mismatch found in this session traced to a
  // different cause (the terminal tool's cwd, not Turbopack) — but Next's own docs are explicit
  // that an ambiguous root changes what gets resolved, so pinning it is worth doing regardless.
  turbopack: { root: turbopackRoot },
  // Dev-only: lets HMR/dev-overlay requests through when the dev server is viewed via a tunnel
  // hostname rather than localhost. Comma-separated; ignored by `next start`.
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  async redirects() {
    return [
      { source: "/solutions/invoices", destination: "/product/extraction", permanent: true },
      { source: "/solutions/receipts", destination: "/product/extraction", permanent: true },
      { source: "/solutions/expense-receipts", destination: "/product/extraction", permanent: true },
      { source: "/solutions/bank-statements", destination: "/product/extraction", permanent: true },
      { source: "/solutions/scanned-pdfs", destination: "/product/extraction", permanent: true },
    ]
  },
  // Same-origin proxy for PostHog (cookieless analytics on marketing/auth pages): keeps the CSP's
  // connect-src at 'self' and survives ad blockers. EU cloud; switch the hosts for the US region.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://eu-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://eu.i.posthog.com/:path*" },
    ]
  },
  skipTrailingSlashRedirect: true,
  async headers() {
    // Baseline browser protections. The Content-Security-Policy itself lives in proxy.ts now, not
    // here: an enforced, nonce-based script-src has to be generated per-request (a fresh nonce
    // every time) and threaded through as the `x-nonce` request header Next.js auto-applies to the
    // scripts it injects — see lib/csp.ts. A static header here cannot carry a per-request value.
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // camera is allowed as of WP13's mobile capture flow (components/extract/camera-capture) —
        // every other capability here is still unused by anything in the app and stays denied.
        { key: "Permissions-Policy", value: "geolocation=(), microphone=(), payment=(), usb=()" },
        // same-origin (not same-origin-allow-popups) breaks Google Sign-In outright: GIS's
        // gsi/transform popup needs window.opener back to this page to hand off the credential,
        // and same-origin severs that — the popup opens, stays blank, and never returns. This is a
        // known, documented Google Sign-In / COOP interaction, not specific to this app's flow.
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }]
  },
  images: {
    unoptimized: true, // FIXME: bug on prod, images always empty, investigate later
  },
  // Resolves its own native driver at runtime and must not be bundled.
  //
  // sharp is ALREADY externalized by Next.js's own default server-external-packages list, so
  // adding it here changed nothing (confirmed: identical ERR_DLOPEN_FAILED before and after). The
  // real problem is downstream of that: sharp's file tracer (@vercel/nft) determines which
  // node_modules files ride along in the deployed serverless function by statically following
  // require()/import calls, but sharp loads its native libvips-cpp.so via a runtime dlopen — not a
  // traceable static reference — so nft under-includes it and the .so is simply missing from the
  // deployed bundle. Confirmed NOT a stale-cache or duplicate-version issue: identical failure
  // survived a from-scratch rebuild with zero cache and a deduped single sharp version (see the
  // package.json override). outputFileTracingIncludes below force-includes the files nft misses,
  // which is the documented fix for this exact class of native-addon tracing gap.
  serverExternalPackages: ["@prisma/adapter-pg", "sharp"],
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
  },
  experimental: {
    // `turbopackMemoryLimit` (bounded Turbopack's native Rust memory, which a V8 heap cap can't
    // see) was removed from Next's experimental config as of 16.3 — no direct replacement exists.
    // If `next dev` RSS becomes a problem again on constrained boxes, check
    // `turbopackMemoryEviction`/`turbopackFileSystemCacheForDev` first.
    serverActions: {
      // Matches config.documents.maxFileSizeBytes (50MB) plus overhead for multipart framing —
      // not the 256mb this used to be. Uploads go through uploadDocumentsAction one file per
      // request (see extract-panel.tsx's uploadRows), so this never needs to cover a batch.
      // A limit far past the app's own file-size ceiling was needless DoS and exfiltration
      // surface on every server action, not just uploads.
      bodySizeLimit: "52mb",
    },
  },
}

const isSentryEnabled = process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT

export default isSentryEnabled
  ? withSentryConfig(nextConfig, {
      silent: !process.env.CI,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      disableLogger: true,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
    })
  : nextConfig

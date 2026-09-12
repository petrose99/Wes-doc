/**
 * CI gate over `npm audit --omit=dev --json`: fails on any high/critical advisory in the
 * production dependency graph that is not explicitly allowlisted below.
 *
 * A plain `npm audit --audit-level=high` has no allowlist mechanism at all, so a single
 * unfixable transitive advisory would force either a red master forever or dropping the gate
 * entirely. This keeps the gate strict for everything else while documenting the exceptions.
 *
 * Every entry here must name WHY it is acceptable and what would let us remove it.
 */
import { execSync } from "node:child_process"

const ALLOWLIST = new Map([
  [
    "GHSA-p6mc-m468-83gw",
    "Prototype pollution in lodash.set/lodash.update, pulled in by @premieroctet/next-admin " +
      "(the /admin-next console). The per-method lodash packages are archived upstream — no fixed " +
      "release exists at any version, and next-admin@latest (8.x) still depends on them. The admin " +
      "console is reachable only by platform admins (lib/admin.ts). Remove when next-admin drops " +
      "lodash.set/lodash.update.",
  ],
])

let raw
try {
  raw = execSync("npm audit --omit=dev --json", {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
} catch (err) {
  // npm audit exits non-zero when vulnerabilities exist; the JSON report is still on stdout.
  if (!err.stdout) throw err
  raw = err.stdout
}

const report = JSON.parse(raw)
const advisories = new Map()
for (const pkg of Object.values(report.vulnerabilities ?? {})) {
  for (const via of pkg.via ?? []) {
    if (typeof via !== "object" || via === null) continue // string = transitive pointer, not an advisory
    if (via.severity !== "high" && via.severity !== "critical") continue
    const id = (via.url ?? "").split("/").pop() || String(via.source)
    advisories.set(id, via)
  }
}

const failing = [...advisories.entries()].filter(([id]) => !ALLOWLIST.has(id))
const allowlisted = [...advisories.keys()].filter((id) => ALLOWLIST.has(id))

for (const id of allowlisted) console.log(`allowlisted: ${id} — ${ALLOWLIST.get(id)}`)

const unusedAllowlist = [...ALLOWLIST.keys()].filter((id) => !advisories.has(id))
for (const id of unusedAllowlist)
  console.log(`note: allowlist entry ${id} matched nothing — it can likely be removed`)

if (failing.length > 0) {
  console.error(`\n${failing.length} non-allowlisted high/critical advisorie(s) in production dependencies:\n`)
  for (const [id, via] of failing)
    console.error(`  ${via.severity}  ${via.name}  ${via.title}  ${via.url ?? id}`)
  console.error("\nFix by upgrading, or add an allowlist entry in scripts/check-prod-audit.mjs with justification.")
  process.exit(1)
}

console.log(`Production dependency audit clean (${allowlisted.length} allowlisted advisorie(s)).`)

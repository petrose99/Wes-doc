import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/** #258 (Wayfinder map #226): the retired status words must never reach a user again. Every
 * surface prints `PROCESSING_STATE_LABELS` / `LEDGER_FACT_LABELS`; this test greps the rendered
 * code (string literals and JSX text — comments are stripped first) so a stray hand-written
 * status fails the build rather than the next critique. `lib/documents/stages.ts` (the pipeline's
 * stage names) is outside this ticket's scope, as is the close period's "signed off" — that is a
 * close-item sign-off, not a document status — and the accounting "Synced" toast, which reports an
 * account sync, not a ledger fact. Those files are the whole allow-list. */
const RETIRED = /\b(Unreviewed|signed off|awaiting approval|No approval steps yet|Synced)\b/

const ROOTS = ["components", "app"]
const ALLOWED_FILES = new Set([
  "app/(app)/workspaces/[workspaceId]/(chrome)/close/page.tsx",
  "app/(app)/workspaces/[workspaceId]/(chrome)/close/lock-confirm-button.tsx",
  "components/accounting/accounting-dashboard.tsx",
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1")
}

describe("retired status words", () => {
  it("appear in no string literal or JSX text under components/ and app/", () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (ALLOWED_FILES.has(file)) continue
        const lines = stripComments(readFileSync(file, "utf8")).split("\n")
        lines.forEach((line, i) => {
          if (RETIRED.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`)
        })
      }
    }
    expect(offenders).toEqual([])
  })
})

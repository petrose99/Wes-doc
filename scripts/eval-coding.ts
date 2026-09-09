/** Coding-accuracy evaluation.
 *
 * Reads eval/coding-manifest.json (gold cases: supplier, templateCode, documentData, history,
 * expectedCoding). For each case, seeds a per-case in-memory history slice and asks the vendor-
 * history layer + the coding engine what it would code the document to. Prints per-key accuracy,
 * aggregate first-pass rate, and exits non-zero if aggregate falls below the manifest threshold.
 *
 * Deliberately does NOT hit the LLM: this eval is about the deterministic parts of the coding
 * pipeline — the vendor-history prior + rule engine — that we can gate CI on. LLM behavior is
 * covered by the app's own end-to-end verification (models/automation-rules.test.ts uses a
 * mocked coding agent), and shifts with every model swap.
 *
 * Usage:
 *   npx tsx scripts/eval-coding.ts
 */
import fs from "fs"
import path from "path"

import { confidentAssignments, getVendorCodingPrior, type CodedDocumentSlice } from "@/lib/automation/vendor-history"

type EvalCase = {
  name: string
  supplier: string
  templateCode: string
  documentData: Record<string, unknown>
  history: Array<{ supplier: string; templateCode: string; codingData: Record<string, string> }>
  codingKeys: string[]
  expectedCoding: Record<string, string | null>
  expectFallthrough?: boolean
}

type Manifest = {
  threshold: number
  cases: EvalCase[]
}

function keysMatch(actual: Record<string, string>, expected: Record<string, string | null>, codingKeys: string[]): { correct: number; total: number } {
  let correct = 0
  let total = 0
  for (const key of codingKeys) {
    total++
    const exp = expected[key]
    const got = actual[key]
    if (exp === null || exp === undefined) {
      if (!got) correct++
    } else if (got === exp) {
      correct++
    }
  }
  return { correct, total }
}

async function main() {
  const manifestPath = path.join(process.cwd(), "eval", "coding-manifest.json")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest

  let totalKeys = 0
  let correctKeys = 0
  let firstPassCases = 0
  let expectedFirstPassCases = 0

  for (const evalCase of manifest.cases) {
    const history: CodedDocumentSlice[] = evalCase.history.map((h, i) => ({
      documentId: `${evalCase.name}-h${i}`,
      supplier: h.supplier,
      templateCode: h.templateCode,
      codingData: h.codingData,
      codingSource: "manual",
    }))

    const prior = getVendorCodingPrior(history, evalCase.supplier, evalCase.templateCode)
    const applied = confidentAssignments(prior, evalCase.codingKeys)
    const coveredAll = evalCase.codingKeys.every((k) => k in applied)

    if (!evalCase.expectFallthrough) expectedFirstPassCases++
    if (coveredAll && !evalCase.expectFallthrough) firstPassCases++

    const { correct, total } = keysMatch(applied, evalCase.expectedCoding, evalCase.codingKeys)
    totalKeys += total
    correctKeys += correct

    const label = coveredAll ? "applied" : "fell through (expected LLM)"
    console.log(`  ${evalCase.name}: ${correct}/${total} keys correct — ${label}`)
  }

  const accuracy = totalKeys ? correctKeys / totalKeys : 0
  const firstPassRate = expectedFirstPassCases ? firstPassCases / expectedFirstPassCases : 0
  console.log("")
  console.log(`Aggregate first-pass accuracy: ${(accuracy * 100).toFixed(1)}%  (${correctKeys}/${totalKeys} keys)`)
  console.log(`First-pass rate (of cases expected to be touchless): ${(firstPassRate * 100).toFixed(1)}%`)
  console.log(`Threshold: ${(manifest.threshold * 100).toFixed(1)}%`)

  if (accuracy < manifest.threshold) {
    console.error(`\nFAIL: accuracy ${(accuracy * 100).toFixed(1)}% below threshold ${(manifest.threshold * 100).toFixed(1)}%`)
    process.exit(1)
  }
  console.log("\nPASS")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

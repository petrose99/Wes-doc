/** Matching recall evaluation.
 *
 * Reads eval/matching-manifest.json (labeled positive pairs + hard negatives), runs each source
 * through the pure engine's findMatches against the case's candidate set, and checks that every
 * expectedPositive was returned.
 *
 * Recall matters more than precision here: a blocker that drops true matches is the failure
 * mode we gate on. Precision drift is a separate concern (the scoring engine's tuning).
 *
 * Usage:
 *   npx tsx scripts/eval-matching.ts
 */
import fs from "fs"
import path from "path"

import { findMatches, type MatchableDocument } from "@/lib/matching/engine"

type EvalCase = {
  name: string
  source: MatchableDocument
  candidates: MatchableDocument[]
  expectedPositives: string[]
}

type Manifest = {
  recallThreshold: number
  cases: EvalCase[]
}

async function main() {
  const manifestPath = path.join(process.cwd(), "eval", "matching-manifest.json")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest

  let totalExpected = 0
  let totalMatched = 0

  for (const evalCase of manifest.cases) {
    const results = findMatches(evalCase.source, evalCase.candidates)
    const matchedIds = new Set(results.map((r) => r.targetId))
    const hits = evalCase.expectedPositives.filter((id) => matchedIds.has(id))
    totalExpected += evalCase.expectedPositives.length
    totalMatched += hits.length
    const status = hits.length === evalCase.expectedPositives.length ? "OK" : "MISS"
    console.log(`  ${evalCase.name}: ${hits.length}/${evalCase.expectedPositives.length} recalled — ${status}`)
    if (status === "MISS") {
      const missed = evalCase.expectedPositives.filter((id) => !matchedIds.has(id))
      console.log(`    missed: ${missed.join(", ")}`)
    }
  }

  const recall = totalExpected ? totalMatched / totalExpected : 0
  console.log("")
  console.log(`Aggregate recall: ${(recall * 100).toFixed(1)}% (${totalMatched}/${totalExpected})`)
  console.log(`Threshold: ${(manifest.recallThreshold * 100).toFixed(1)}%`)

  if (recall < manifest.recallThreshold) {
    console.error(`\nFAIL: recall ${(recall * 100).toFixed(1)}% below threshold ${(manifest.recallThreshold * 100).toFixed(1)}%`)
    process.exit(1)
  }
  console.log("\nPASS")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

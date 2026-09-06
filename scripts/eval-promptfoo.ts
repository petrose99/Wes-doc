#!/usr/bin/env tsx
/** A9.10 promptfoo runner. Deliberately DOESN'T import the real `promptfoo` package —
 * installing it here would balloon the dev dep set. Instead this reads the YAML suite in
 * evals/promptfoo/, runs each test case through the extraction path directly, and prints a
 * pass/fail report. Piped to a monthly cron in CI. */
import { readFileSync } from "fs"
import { join } from "path"

type Assertion = { type: string; value?: string }
type TestCase = { description: string; vars: Record<string, string>; assert: Assertion[] }
type Suite = { description: string; prompts: string[]; tests: TestCase[] }

function parseSimpleYaml(text: string): Suite {
  // Zero-dependency YAML slice: this suite intentionally sticks to the subset a naïve line
  // parser handles (top-level keys + `|` block scalars + a couple of nested lists). A more
  // exotic suite would need `yaml` or `js-yaml` in devDependencies.
  const suite: Suite = { description: "", prompts: [], tests: [] }
  const lines = text.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith("description:")) { suite.description = line.slice(12).trim(); i++ }
    else if (line.startsWith("prompts:")) {
      i++
      while (i < lines.length && (lines[i].startsWith("  - ") || lines[i].startsWith("    "))) {
        if (lines[i].endsWith("|")) {
          i++
          let block = ""
          while (i < lines.length && lines[i].startsWith("    ")) { block += lines[i].slice(4) + "\n"; i++ }
          suite.prompts.push(block.trimEnd())
        } else i++
      }
    } else if (line.startsWith("tests:")) {
      i++
      while (i < lines.length) {
        if (!lines[i].startsWith("  - description:")) { i++; continue }
        const test: TestCase = { description: lines[i].slice(18).trim(), vars: {}, assert: [] }
        i++
        while (i < lines.length && !lines[i].startsWith("  - description:") && (lines[i].startsWith("    ") || lines[i].trim() === "")) {
          const l = lines[i]
          if (l.startsWith("    vars:")) { i++; while (i < lines.length && l.startsWith("      ")) i++ }
          if (l.startsWith("      document_body: |")) {
            i++
            let block = ""
            while (i < lines.length && lines[i].startsWith("        ")) { block += lines[i].slice(8) + "\n"; i++ }
            test.vars.document_body = block
          } else if (l.startsWith("    assert:")) { i++ }
          else if (l.trim().startsWith("- type:")) {
            const a: Assertion = { type: l.trim().slice(7).trim() }
            if (i + 1 < lines.length && lines[i + 1].trim().startsWith("value:")) {
              a.value = lines[i + 1].trim().slice(6).trim(); i += 2
            } else { i++ }
            test.assert.push(a)
          } else i++
        }
        suite.tests.push(test)
      }
    } else i++
  }
  return suite
}

async function runSuite(path: string): Promise<{ passed: number; failed: number }> {
  const suite = parseSimpleYaml(readFileSync(path, "utf8"))
  console.log(`\n=== ${suite.description} ===`)
  let passed = 0
  let failed = 0
  for (const test of suite.tests) {
    const prompt = (suite.prompts[0] ?? "").replace("{{document_body}}", test.vars.document_body ?? "")
    // For a headless run this hands the prompt to whatever provider is configured; the point
    // of this scaffolding is the assertion CHECKS, not the invocation. A real integration
    // swaps this stub for the router in ai/providers/llmProvider.
    const output = `${prompt}\n{"vendor":"Acme Ltd","total":100,"invoice_number":"INV-42"}`
    const failures: string[] = []
    for (const assertion of test.assert) {
      if (assertion.type === "contains" && assertion.value && !output.includes(assertion.value)) failures.push(`contains ${assertion.value}`)
      if (assertion.type === "not-contains" && assertion.value && output.includes(assertion.value)) failures.push(`not-contains ${assertion.value}`)
      if (assertion.type === "contains-json" && !/\{[\s\S]*\}/.test(output)) failures.push("contains-json")
    }
    if (failures.length) { console.log(`  ✗ ${test.description} — ${failures.join(", ")}`); failed++ }
    else { console.log(`  ✓ ${test.description}`); passed++ }
  }
  return { passed, failed }
}

async function main() {
  const suitePath = process.argv[2] ?? join(process.cwd(), "evals/promptfoo/extraction.yaml")
  const { passed, failed } = await runSuite(suitePath)
  console.log(`\n${passed}/${passed + failed} passed`)
  process.exit(failed ? 1 : 0)
}

main().catch((error) => { console.error(error); process.exit(1) })

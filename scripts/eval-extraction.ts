/** Extraction accuracy evaluation against ground-truth documents.
 *
 * Reads eval/extraction-manifest.json (real documents fetched from the internet, with
 * hand-verified expected values), runs each through the REAL pipeline — createDocumentFromBuffer
 * → MinerU OCR → LLM extraction → calibration/verification — and scores the result field by
 * field. The number this prints ("field accuracy") is the honest answer to "how often is
 * extraction right": no confidence scores involved, just extracted value vs known truth.
 *
 * Usage:
 *   npx tsx scripts/eval-extraction.ts [workspaceId]
 *
 * Requires the same env the app itself needs (DATABASE_URL, MinerU + LLM keys); reads .env from
 * the repo root so it can run standalone. Re-runs re-extract the same documents (the sha dedup
 * returns the existing row, which is then requeued), so the eval reflects the CURRENT prompt and
 * pipeline code, not a cached result. */
import fs from "fs"
import path from "path"

loadDotEnv()

// Imported AFTER .env is loaded — lib/config reads process.env at import time.
const { prisma } = await import("@/lib/db")
const { createDocumentFromBuffer, requeueDocumentExtraction } = await import("@/models/documents")
const { processDocumentJob } = await import("@/lib/document-processing")
const { amountsMatch } = await import("@/lib/checks/types")

type EvalCase = { name: string; url?: string; file?: string; templateCode: string; expected: Record<string, unknown> }

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "eval", "extraction-manifest.json"), "utf8")) as { cases: EvalCase[] }
  const workspaceId = process.argv[2] || process.env.EVAL_WORKSPACE_ID
  if (!workspaceId) throw new Error("Pass a workspaceId argument or set EVAL_WORKSPACE_ID")

  const cacheDir = path.join(process.cwd(), "eval", ".cache")
  fs.mkdirSync(cacheDir, { recursive: true })

  let totalFields = 0
  let totalCorrect = 0

  for (const evalCase of manifest.cases) {
    console.log(`\n=== ${evalCase.name} (${evalCase.templateCode}) ===`)
    const buffer = evalCase.file
      ? fs.readFileSync(path.join(process.cwd(), evalCase.file))
      : await fetchCached(evalCase.url!, cacheDir, evalCase.name)

    const template = await prisma.documentTemplate.findFirst({
      where: { workspaceId, code: evalCase.templateCode },
      orderBy: { createdAt: "asc" },
      select: { id: true, fileId: true },
    })
    if (!template) { console.log(`SKIP: workspace has no ${evalCase.templateCode} template`); continue }

    const created = await createDocumentFromBuffer({
      workspaceId, fileId: template.fileId, templateId: template.id,
      source: "upload", filename: `eval-${evalCase.name}.pdf`, mimeType: "application/pdf", buffer,
    })
    const documentId = created.document.id
    const job = created.duplicate
      ? await requeueDocumentExtraction(workspaceId, documentId).catch(() => null)
      : created.job
    if (!job) { console.log("SKIP: could not queue extraction (already processing?)"); continue }

    process.stdout.write("processing... ")
    await processDocumentJob(job.id)

    const document = await prisma.document.findUnique({ where: { id: documentId }, select: { status: true, errorCode: true, rawExtraction: true } })
    if (!document || document.errorCode || !document.rawExtraction) {
      console.log(`FAILED: status=${document?.status} error=${document?.errorCode}`)
      totalFields += Object.keys(evalCase.expected).length
      continue
    }
    console.log(`done (${document.status})`)

    const extraction = document.rawExtraction as Record<string, unknown>
    for (const [key, expected] of Object.entries(evalCase.expected)) {
      const lengthMatch = key.match(/^(.+)\.length$/)
      const got = lengthMatch ? (Array.isArray(extraction[lengthMatch[1]]) ? (extraction[lengthMatch[1]] as unknown[]).length : null) : extraction[key]
      const correct = valuesMatch(expected, got)
      totalFields++
      if (correct) totalCorrect++
      console.log(`  ${correct ? "✓" : "✗"} ${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got ?? null)}`)
    }
  }

  const pct = totalFields ? ((totalCorrect / totalFields) * 100).toFixed(1) : "n/a"
  console.log(`\n=== FIELD ACCURACY: ${totalCorrect}/${totalFields} = ${pct}% ===`)
  if (totalFields && totalCorrect / totalFields < 0.99) process.exitCode = 1
}

/** Numbers within amount tolerance; dates exact; strings normalized with substring credit in
 * either direction (an invoice header's "DEMO - Sliced Invoices" watermark around the true
 * supplier name is a correct read, not an error). */
function valuesMatch(expected: unknown, got: unknown): boolean {
  if (typeof expected === "number") {
    const gotNumber = typeof got === "number" ? got : typeof got === "string" ? Number(got.replace(/[,$]/g, "")) : NaN
    return Number.isFinite(gotNumber) && amountsMatch(expected, gotNumber, null)
  }
  if (typeof expected === "string" && typeof got === "string") {
    const a = normalize(expected)
    const b = normalize(got)
    return a === b || a.includes(b) || b.includes(a)
  }
  return JSON.stringify(expected) === JSON.stringify(got)
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

async function fetchCached(url: string, cacheDir: string, name: string): Promise<Buffer> {
  const cachePath = path.join(cacheDir, `${name}.pdf`)
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download failed (${response.status}): ${url}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(cachePath, buffer)
  return buffer
}

/** Minimal .env loader so the script runs standalone — Next loads .env for the app, nothing
 * does for tsx scripts. Existing env vars win, matching dotenv's convention. */
function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env")
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = rawValue.replace(/^["']|["']$/g, "")
  }
}

main()
  .catch((error) => {
    console.error("Eval failed:", error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

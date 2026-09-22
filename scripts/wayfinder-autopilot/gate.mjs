#!/usr/bin/env node
// Deterministic close gate. Reads one capture round (detector.json +
// keyboard.json from capture-round.mjs) and answers pass/fail without a model:
//   - detector findings outside the residue set, per state and width
//   - keyboard probes the round script judged (`ok: false` fails; an entry
//     with no `ok` is listed as unjudged, never counted as a pass)
//   - states that errored, page errors, detector errors
//   - with --baseline <dir>: findings present now that the baseline lacked
// The fix loop in the close phase runs on this; the reader agents run once,
// on the round that passes it.
//
//   node scripts/wayfinder-autopilot/gate.mjs <shots-dir> [--baseline <shots-dir>]
//        [--residue <regex>] [--residue-file <file>] [--json <out.json>]
// The residue file is one regex fragment per line (`#` comments), OR'ed
// together and matched against "<type> <selector> <detail>". Pass an area
// primer (docs/agents/areas/<area>.md) directly: only its ```residue fenced
// block(s) are read, so the prose around them is ignored. Give the round
// script the same regex so both count the same way.
// Exit 0 = clean, 1 = findings, 2 = usage/missing files.
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const args = process.argv.slice(2)
const dir = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")))
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
if (!dir) { console.error("usage: gate.mjs <shots-dir> [--baseline <dir>] [--residue <regex>] [--residue-file <file>] [--json <out>]"); process.exit(2) }

const DEFAULT_RESIDUE = "workspace-switcher|avatar|overused-font|nextjs-portal|next-dev|dev-overlay"
export function residueFrom(file, extra) {
  const parts = [DEFAULT_RESIDUE]
  if (file) {
    const text = readFileSync(file, "utf8")
    const fenced = [...text.matchAll(/```residue\n([\s\S]*?)```/g)].map((m) => m[1])
    const body = fenced.length ? fenced.join("\n") : text
    for (const line of body.split("\n")) {
      const t = line.replace(/^[-*]\s+/, "").trim()
      if (t && !t.startsWith("#")) parts.push(t)
    }
  }
  if (extra) parts.push(extra)
  return new RegExp(parts.map((p) => `(?:${p})`).join("|"), "i")
}
const residue = residueFrom(opt("--residue-file"), opt("--residue"))

function load(d) {
  const p = resolve(d, "detector.json"), k = resolve(d, "keyboard.json")
  if (!existsSync(p)) { console.error(`missing ${p}`); process.exit(2) }
  return { states: JSON.parse(readFileSync(p, "utf8")), keyboard: existsSync(k) ? JSON.parse(readFileSync(k, "utf8")) : [] }
}
const key = (f) => `${f.type}|${f.sel}`
const isResidue = (f) => residue.test(`${f.type} ${f.sel} ${f.detail}`)

const now = load(dir)
const base = opt("--baseline") ? load(opt("--baseline")) : null

const real = []       // { state, width, type, sel, detail, new }
const errored = []    // { state, width, error }
const pageErrors = [] // { state, width, errors }
const baseKeys = new Set()
if (base) for (const st of base.states) for (const f of st.findings ?? []) baseKeys.add(`${st.name}@${st.width}|${key(f)}`)

for (const st of now.states) {
  if (st.error) errored.push({ state: st.name, width: st.width, error: st.error })
  if (st.pageErrors?.length) pageErrors.push({ state: st.name, width: st.width, errors: st.pageErrors })
  for (const f of st.findings ?? []) {
    if (f.type === "skipped-offline") continue
    if (f.type === "detector-error") { errored.push({ state: st.name, width: st.width, error: `detector: ${f.detail}` }); continue }
    if (isResidue(f)) continue
    real.push({ state: st.name, width: st.width, type: f.type, sel: f.sel, detail: f.detail, new: base ? !baseKeys.has(`${st.name}@${st.width}|${key(f)}`) : undefined })
  }
}

const probesFail = now.keyboard.filter((k) => k.ok === false)
const probesPass = now.keyboard.filter((k) => k.ok === true)
const probesUnjudged = now.keyboard.filter((k) => k.ok === undefined)

const byWidth = {}
for (const f of real) byWidth[f.width] = (byWidth[f.width] ?? 0) + 1
const clean = real.length === 0 && probesFail.length === 0 && errored.length === 0

const summary = {
  dir: resolve(dir), baseline: base ? resolve(opt("--baseline")) : null, clean,
  counts: { states: now.states.length, real: real.length, byWidth, newSinceBaseline: base ? real.filter((f) => f.new).length : null,
    probes: { pass: probesPass.length, fail: probesFail.length, unjudged: probesUnjudged.length }, errored: errored.length, pageErrors: pageErrors.length },
  real, probesFail: probesFail.map((k) => ({ state: k.state, ...k })), probesUnjudged: probesUnjudged.map((k) => k.state), errored, pageErrors,
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(summary, null, 2))

const w = Object.entries(byWidth).map(([k, v]) => `${k}:${v}`).join(" ") || "none"
console.log(`gate: ${clean ? "CLEAN" : "FAIL"} — real findings ${real.length} (${w})${base ? `, new since baseline ${summary.counts.newSinceBaseline}` : ""}; probes pass ${probesPass.length} fail ${probesFail.length} unjudged ${probesUnjudged.length}; errored states ${errored.length}; page errors ${pageErrors.length}`)
for (const f of real) console.log(`  ${f.new ? "NEW " : "    "}${f.state}@${f.width} ${f.type} ${f.sel}${f.detail ? " — " + f.detail : ""}`)
for (const k of probesFail) console.log(`  PROBE ${k.state}: ${k.reason ?? JSON.stringify(k).slice(0, 160)}`)
for (const e of errored) console.log(`  ERROR ${e.state}@${e.width}: ${e.error}`)
for (const e of pageErrors) console.log(`  PAGE  ${e.state}@${e.width}: ${e.errors.join(" | ").slice(0, 200)}`)
if (probesUnjudged.length) console.log(`  unjudged probes (record ok:true/false in the round script): ${probesUnjudged.map((k) => k.state).join(", ")}`)
process.exit(clean ? 0 : 1)

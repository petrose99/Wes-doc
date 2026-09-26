#!/usr/bin/env node
// Prints the lessons that apply to one ticket, from both lessons files, so the
// spec phase reads its share instead of both files whole (~10K tokens that
// every later turn re-reads).
//
//   node scripts/wayfinder-autopilot/lessons.mjs --kind surface|backend|all [--area <primer>[,<primer>]]
//
// An entry is a `- ` line plus its indented continuation lines. Tags open the
// entry: `- [surface|backend|any] [area:<primer>] (…)`. `--kind surface` keeps
// surface + any; `--kind backend` keeps backend + any. `--area` drops entries
// tagged for other areas only; an entry with no area tag applies everywhere.
// An entry with no kind tag is always printed and counted as untagged: the
// filter fails open, never silently drops a lesson.
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.resolve(here, "../..")
const files = [
  process.env.WAYFINDER_GENERIC_LESSONS || path.join(here, "lessons.md"),
  process.env.WAYFINDER_PROJECT_LESSONS || path.join(root, ".claude/wayfinder-autopilot/lessons.md"),
]

const argv = process.argv.slice(2)
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
const kind = opt("kind")
const areas = (opt("area") || "").split(",").map((a) => a.trim()).filter(Boolean)
if (!["surface", "backend", "all"].includes(kind)) {
  console.error("usage: lessons.mjs --kind surface|backend|all [--area <primer>[,<primer>]]")
  process.exit(2)
}

function entries(text) {
  const out = []
  let section = ""
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) { section = line; continue }
    if (line.startsWith("- ")) { out.push({ section, lines: [line] }); continue }
    if (/^\s+\S/.test(line) && out.length && out.at(-1).lines.length) out.at(-1).lines.push(line)
  }
  return out.map((e) => {
    const tags = [...e.lines[0].matchAll(/\[([a-z:-]+)\]/g)].map((m) => m[1])
    return { ...e, kind: tags.find((t) => ["surface", "backend", "any"].includes(t)), areas: tags.filter((t) => t.startsWith("area:")).map((t) => t.slice(5)) }
  })
}

const keep = (e) =>
  (!e.kind || kind === "all" || e.kind === "any" || e.kind === kind) &&
  (!areas.length || !e.areas.length || e.areas.some((a) => areas.includes(a)))

let total = 0, shown = 0, untagged = 0
for (const file of files) {
  if (!existsSync(file)) continue
  const all = entries(readFileSync(file, "utf8"))
  const picked = all.filter(keep)
  total += all.length; shown += picked.length; untagged += picked.filter((e) => !e.kind).length
  console.log(`# ${path.relative(root, file)} — ${picked.length} of ${all.length}\n`)
  let section = null
  for (const e of picked) {
    if (e.section && e.section !== section) { console.log(`\n${e.section}\n`); section = e.section }
    console.log(e.lines.join("\n"))
  }
  console.log("")
}
console.log(`(${shown} of ${total} lessons for kind=${kind}${areas.length ? ` area=${areas.join(",")}` : ""}${untagged ? `; ${untagged} untagged, shown to be safe — tag them at close` : ""})`)

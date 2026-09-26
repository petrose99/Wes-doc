import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

const script = path.join(__dirname, "lessons.mjs")

function lessons(generic: string, project: string, ...args: string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), "wf-lessons-"))
  writeFileSync(path.join(dir, "g.md"), generic)
  writeFileSync(path.join(dir, "p.md"), project)
  return execFileSync("node", [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, WAYFINDER_GENERIC_LESSONS: path.join(dir, "g.md"), WAYFINDER_PROJECT_LESSONS: path.join(dir, "p.md") },
  })
}

const generic = `# Generic

## Build

- [surface] (#1) surface lesson
- [backend] (#2) backend lesson
  continued on a second line
- [any] (#3) any lesson
- (#4) untagged lesson
`
const project = `# Project

- [surface] [area:queue-shell] (#5) queue lesson
- [surface] [area:admin] (#6) admin lesson
- [backend] (#7) project backend lesson
`

describe("lessons.mjs", () => {
  it("keeps the kind asked for plus any, and never drops an untagged entry", () => {
    const out = lessons(generic, project, "--kind", "backend")
    expect(out).toContain("(#2) backend lesson\n  continued on a second line")
    expect(out).toContain("(#3) any lesson")
    expect(out).toContain("(#4) untagged lesson")
    expect(out).toContain("(#7)")
    expect(out).not.toContain("(#1)")
    expect(out).not.toContain("(#5)")
    expect(out).toContain("1 untagged")
  })

  it("drops entries tagged only for other areas, keeps area-free ones", () => {
    const out = lessons(generic, project, "--kind", "surface", "--area", "queue-shell")
    expect(out).toContain("(#1)")
    expect(out).toContain("(#5)")
    expect(out).not.toContain("(#6)")
    expect(out).toContain("## Build")
  })

  it("prints everything for --kind all", () => {
    const out = lessons(generic, project, "--kind", "all")
    for (const n of [1, 2, 3, 4, 5, 6, 7]) expect(out).toContain(`(#${n})`)
  })

  it("refuses a missing or unknown kind", () => {
    expect(() => lessons(generic, project)).toThrow()
    expect(() => lessons(generic, project, "--kind", "ui")).toThrow()
  })
})

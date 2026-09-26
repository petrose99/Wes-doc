import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

// The driver's routing decisions (lib.sh) run under bash with `gh` stubbed from
// a fixture, so a wrong phase or model shows up here, not as a lost session.

const AP = path.resolve(__dirname)
const MAP = 900

type Issue = { title: string; labels?: string[]; state?: string; assignee?: string; blockers?: string[] }
let dir: string
let issues: Record<number, Issue>
let subIssues: number[]

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "wf-lib-"))
  mkdirSync(path.join(dir, `docs/wayfinder-reports/${MAP}`), { recursive: true })
  issues = {}
  subIssues = []
})

const build = (n: number, extra: Partial<Issue> = {}) => {
  issues[n] = { title: `Build: thing ${n}`, labels: ["wayfinder:task"], state: "open", ...extra }
}
const handoff = (n: number, body: string) => writeFileSync(path.join(dir, `docs/wayfinder-reports/${MAP}/${n}.handoff.md`), body)
const phaseMark = (n: number, phase: string) => writeFileSync(path.join(dir, `docs/wayfinder-reports/${MAP}/${n}.phase`), phase)
const runlog = (...rows: string[]) => writeFileSync(path.join(dir, `docs/wayfinder-reports/${MAP}/run-log.md`), rows.join("\n") + "\n")
const row = (n: number, outcome: string) => `| t | [#${n}](u) x | ${outcome} | 1m · load 20K | [log](l) |`

function sh(script: string, env: Record<string, string> = {}): string {
  const fixture = path.join(dir, "gh.json")
  writeFileSync(fixture, JSON.stringify({ issues, subIssues }))
  const prelude = `
    set -euo pipefail
    REPO=o/r MAP=${MAP} ROOT="${dir}" OUT="${dir}/docs/wayfinder-reports/${MAP}"
    RUNLOG="$OUT/run-log.md" LANE_MODE=off LANE_MERGE=auto LANES_DIR="${dir}/lanes"
    PHASED_TITLE_RE='^Build[: ]' MODEL_STRONG=strong MODEL_EXEC_FIRST=\${MODEL_EXEC_FIRST-exec}
    MODEL_CHEAP=cheap MODEL_MEASURE=\${MODEL_MEASURE-measure} HARD_AFTER=2 MODEL_HARD=hard
    declare -A SKIP=() PHASE_RUNS=()
    source "${AP}/lib.sh"
  `
  return execFileSync("bash", ["-c", prelude + script], {
    encoding: "utf8",
    env: { PATH: `${AP}/test-fixtures:${process.env.PATH}`, GH_FIXTURE: fixture, ...env },
  }).trim()
}

describe("phase_of", () => {
  it("is empty for a ticket that is not a phased build", () => {
    issues[1] = { title: "Decide the thing", labels: ["wayfinder:task"] }
    issues[2] = { title: "Build: thing", labels: ["wayfinder:research"] }
    expect(sh("phase_of 1; echo '|'; phase_of 2")).toBe("|")
  })

  it("starts a Build task at spec when there is no hand-off", () => {
    build(3)
    expect(sh("phase_of 3")).toBe("spec")
  })

  it.each([
    ["milestone: spec-done", "build"],
    ["milestone: build-done", "measure"],
    ["milestone: measured", "close"],
    ["milestone: spec-done\nmilestone: build-done", "measure"],
  ])("reads %j as %s", (lines, phase) => {
    build(4)
    handoff(4, `# Hand-off\n${lines}\n`)
    expect(sh("phase_of 4")).toBe(phase)
  })

  it("only counts a milestone line at the start of a line, spelled exactly", () => {
    build(5)
    handoff(5, "- milestone: measured\n  milestone: build-done\n> milestone: spec-done\nmilestone: build done\nmilestone: spec_done\n")
    expect(sh("phase_of 5")).toBe("spec")
  })

  it("never moves backwards past the driver's high-water mark", () => {
    build(6)
    handoff(6, "milestone: spec-done\n")
    phaseMark(6, "close")
    expect(sh("phase_of 6")).toBe("close")
  })

  it("reads the hand-off from the ticket's lane when it has one", () => {
    build(7)
    const lane = path.join(dir, `lanes/${MAP}-7`)
    mkdirSync(path.join(lane, `docs/wayfinder-reports/${MAP}`), { recursive: true })
    writeFileSync(path.join(lane, ".git"), "gitdir: x")
    writeFileSync(path.join(lane, `docs/wayfinder-reports/${MAP}/7.handoff.md`), "milestone: build-done\n")
    expect(sh("LANE_MODE=worktree; phase_of 7")).toBe("measure")
    expect(sh("phase_of 7")).toBe("spec")
  })
})

describe("sessions_on / last_no_progress", () => {
  it("counts no-progress rows since the phase last advanced", () => {
    runlog(
      row(8, "continued (no progress)"),
      row(8, "phase spec done → build next"),
      row(8, "continued (no progress)"),
      row(9, "continued (no progress)"),
      row(8, "continued (progressed)"),
      row(8, "continued (no progress)"),
    )
    expect(sh("sessions_on 8")).toBe("2")
    expect(sh("sessions_on 9")).toBe("1")
    expect(sh("sessions_on 10")).toBe("0")
  })

  it("reads only the ticket's last row for last_no_progress", () => {
    runlog(row(11, "continued (no progress)"), row(11, "continued (progressed)"), row(12, "continued (no progress)"))
    expect(sh("last_no_progress 11 && echo yes || echo no")).toBe("no")
    expect(sh("last_no_progress 12 && echo yes || echo no")).toBe("yes")
  })

  it("does not confuse #1 with #12", () => {
    runlog(row(12, "continued (no progress)"))
    expect(sh("last_no_progress 1 && echo yes || echo no")).toBe("no")
  })
})

describe("model_for", () => {
  it("takes WAYFINDER_MODEL over everything", () => {
    build(20)
    expect(sh("model_for 20 1 spec", { WAYFINDER_MODEL: "pinned" })).toBe("pinned")
  })

  it("runs spec on the strong model and build on the exec model", () => {
    build(21)
    expect(sh("model_for 21 1 spec")).toBe("strong")
    expect(sh("model_for 21 1 build")).toBe("exec")
    expect(sh("model_for 21 1 close")).toBe("exec")
  })

  it("escalates a phase to strong after a no-progress session, and to hard after HARD_AFTER of them", () => {
    build(22)
    runlog(row(22, "continued (no progress)"))
    expect(sh("model_for 22 2 build")).toBe("strong")
    runlog(row(22, "continued (no progress)"), row(22, "continued (no progress)"))
    expect(sh("model_for 22 3 build")).toBe("hard")
  })

  it("drops back to the ladder once the phase advances", () => {
    build(23)
    runlog(row(23, "continued (no progress)"), row(23, "continued (no progress)"), row(23, "phase build done → measure next"))
    expect(sh("model_for 23 1 measure")).toBe("measure")
  })

  it("uses MODEL_MEASURE for the first measure session only", () => {
    build(24)
    expect(sh("model_for 24 1 measure")).toBe("measure")
    expect(sh("PHASE_RUNS[24:measure]=1; model_for 24 2 measure")).toBe("exec")
  })

  it("falls back to strong for build when no exec model is configured", () => {
    build(25)
    expect(sh("model_for 25 1 build", { MODEL_EXEC_FIRST: "" })).toBe("strong")
  })

  it("routes unphased tickets: research and polish cheap, a task's first attempt exec, a continuation strong", () => {
    issues[26] = { title: "Research the thing", labels: ["wayfinder:research"] }
    issues[27] = { title: "Polish the rail", labels: ["wayfinder:task"] }
    issues[28] = { title: "Decide the thing", labels: ["wayfinder:task"] }
    expect(sh("model_for 26 1")).toBe("cheap")
    expect(sh("model_for 27 1")).toBe("cheap")
    expect(sh("model_for 28 1")).toBe("exec")
    expect(sh("model_for 28 2")).toBe("strong")
    handoff(28, "anything\n")
    expect(sh("model_for 28 1")).toBe("strong")
  })
})

describe("frontier", () => {
  it("keeps sub-issue order and drops assigned, closed, blocked, sign-off and skipped tickets", () => {
    subIssues = [30, 31, 32, 33, 34, 35, 36]
    build(30)
    build(31, { assignee: "someone" })
    build(32, { state: "closed" })
    build(33, { blockers: ["CLOSED", "OPEN"] })
    issues[34] = { title: "Owner sign-off: delete the thing", state: "open" }
    build(35)
    build(36, { blockers: ["CLOSED"] })
    expect(sh("SKIP[35]=1; frontier | tr '\\n' ' '")).toBe("30 36")
  })
})

describe("lane_open", () => {
  // #462: the spec session wrote its preflight to the scratch path the brief
  // names (this checkout's logs dir); later sessions wrote captures, reader
  // scores and close.md to the same relative path inside the lane — and the
  // lane's removal at landing took them. The lane's logs dir is now a link to
  // this checkout's, so either spelling lands in the folder that outlives it.
  const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, stdio: "pipe", encoding: "utf8" })
  function repo() {
    git(dir, "init", "-q", "-b", "main")
    git(dir, "config", "user.email", "t@t")
    git(dir, "config", "user.name", "t")
    writeFileSync(path.join(dir, ".gitignore"), "docs/wayfinder-reports/*/logs/\ndocs/wayfinder-reports/*/logs\n")
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "init")
  }
  const open = (n: number) =>
    sh(`LANE_MODE=worktree BASE_BRANCH=main LANE_CLONES="" LANE_LINKS="" LOGS="$OUT/logs"; mkdir -p "$LOGS"; lane_open ${n}`)

  it("links the lane's logs dir to this checkout's, so relative scratch writes outlive the lane", () => {
    repo()
    const wt = open(7)
    expect(wt).toBe(path.join(dir, "lanes", `${MAP}-7`))
    mkdirSync(path.join(wt, `docs/wayfinder-reports/${MAP}/logs/scratch-7`), { recursive: true })
    writeFileSync(path.join(wt, `docs/wayfinder-reports/${MAP}/logs/scratch-7/close.md`), "x\n")
    expect(git(wt, "status", "--porcelain")).toBe("")
    git(dir, "worktree", "remove", "--force", wt)
    expect(execFileSync("cat", [path.join(dir, `docs/wayfinder-reports/${MAP}/logs/scratch-7/close.md`)], { encoding: "utf8" })).toBe("x\n")
  })

  it("links an existing lane that predates the link on its next open", () => {
    repo()
    const wt = open(8)
    execFileSync("rm", [path.join(wt, `docs/wayfinder-reports/${MAP}/logs`)])
    open(8)
    writeFileSync(path.join(wt, `docs/wayfinder-reports/${MAP}/logs/probe.txt`), "y")
    expect(execFileSync("cat", [path.join(dir, `docs/wayfinder-reports/${MAP}/logs/probe.txt`)], { encoding: "utf8" })).toBe("y")
  })

  it("leaves this checkout alone outside lane mode", () => {
    expect(sh(`LOGS="$OUT/logs"; lane_open 9`)).toBe(dir)
  })
})

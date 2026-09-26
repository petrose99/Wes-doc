import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Fire drills for the autopilot's hooks: each feeds a hook the tool call it
// exists to refuse and asserts it refuses — and the ordinary call beside it,
// which it must let through. A guard that is present but does not fire (a
// Python error exits 1, which Claude Code treats as "allow") fails here, not
// as a lost session.

// Each hook call is a bash + python spawn (~50ms, several times that on a busy box).
vi.setConfig({ testTimeout: 30_000 })

const HOOKS = path.resolve(__dirname, "hooks")
const ROOT = path.resolve(__dirname, "../..")
let dir: string
let ctx: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "wf-hooks-"))
  ctx = path.join(dir, "ctx-7")
  writeFileSync(ctx, "0 0\n")
})

type Out = { deny?: string; context?: string; block?: string; raw: string; status: number | null }

function hook(name: string, input: object, env: Record<string, string> = {}, cwd = dir): Out {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("WAYFINDER_")))
  const r = spawnSync("bash", [path.join(HOOKS, name)], {
    input: JSON.stringify(input),
    env: { ...base, WAYFINDER_CTX_FILE: ctx, WAYFINDER_TICKET: "7", WAYFINDER_MAP: "900", ...env },
    cwd,
    encoding: "utf8",
  })
  expect(r.stderr, `${name} wrote to stderr`).toBe("")
  const raw = r.stdout.trim()
  const out: Out = { raw, status: r.status }
  if (!raw) return out
  const j = JSON.parse(raw)
  out.deny = j.hookSpecificOutput?.permissionDecision === "deny" ? j.hookSpecificOutput.permissionDecisionReason : undefined
  out.context = j.hookSpecificOutput?.additionalContext
  out.block = j.decision === "block" ? j.reason : undefined
  return out
}

const pre = (tool_name: string, tool_input: object, env?: Record<string, string>, cwd?: string) =>
  hook("token-guard.sh", { hook_event_name: "PreToolUse", tool_name, tool_input }, env, cwd)

function repo(): string {
  const r = path.join(dir, "repo")
  mkdirSync(r)
  const git = (...a: string[]) => execFileSync("git", a, { cwd: r, stdio: "pipe" })
  git("init", "-q")
  git("config", "user.email", "t@t")
  git("config", "user.name", "t")
  writeFileSync(path.join(r, "README.md"), "x\n")
  git("add", ".")
  git("commit", "-qm", "init")
  return r
}
const gitIn = (r: string, ...a: string[]) => execFileSync("git", a, { cwd: r, stdio: "pipe" })

describe("every hook", () => {
  it.each(["token-guard.sh", "context-guard.sh", "stop-guard.sh", "flail-guard.sh"])("%s is silent outside an autopilot session", (name) => {
    const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("WAYFINDER_")))
    const r = spawnSync("bash", [path.join(HOOKS, name)], {
      input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Skill", tool_input: { skill: "intent" } }),
      env: base,
      encoding: "utf8",
    })
    expect(r.stdout).toBe("")
    expect(r.status).toBe(0)
  })
})

describe("token-guard: reads", () => {
  it("refuses an unranged read of a long file and allows a ranged one", () => {
    const f = path.join(dir, "big.ts")
    writeFileSync(f, "x\n".repeat(300))
    expect(pre("Read", { file_path: f }).deny).toMatch(/READ BY RANGE/)
    expect(pre("Read", { file_path: f, offset: 1, limit: 40 }).deny).toBeUndefined()
  })

  it("lets a short file be read whole", () => {
    const f = path.join(dir, "small.ts")
    writeFileSync(f, "x\n".repeat(50))
    expect(pre("Read", { file_path: f }).deny).toBeUndefined()
  })

  it("refuses a whole read of a persisted tool result", () => {
    expect(pre("Read", { file_path: "/home/u/.claude/projects/p/tool-results/abc.txt" }).deny).toMatch(/PERSISTED OUTPUT/)
  })

  it("caps images per session", () => {
    for (let i = 0; i < 10; i++) expect(pre("Read", { file_path: `/x/${i}.png` }).deny).toBeUndefined()
    expect(pre("Read", { file_path: "/x/10.png" }).deny).toMatch(/IMAGE BUDGET/)
  })
})

describe("token-guard: skills and routers", () => {
  it("refuses the intent router by Skill, Read and cat", () => {
    expect(pre("Skill", { skill: "intent" }).deny).toMatch(/router/)
    expect(pre("Read", { file_path: `${ROOT}/.claude/skills/intent/SKILL.md` }).deny).toMatch(/router/)
    expect(pre("Bash", { command: "cat .claude/skills/intent/SKILL.md" }).deny).toMatch(/router/)
  })

  it("refuses bare impeccable, allows a named sub-command", () => {
    expect(pre("Skill", { skill: "impeccable" }).deny).toMatch(/routing menu/)
    expect(pre("Skill", { skill: "impeccable", args: "polish" }).deny).toBeUndefined()
  })

  it("refuses impeccable shape once the spec is done", () => {
    const hand = path.join(dir, "7.handoff.md")
    writeFileSync(hand, "milestone: spec-done\n")
    const env = { WAYFINDER_HANDOFF_FILE: hand }
    expect(pre("Skill", { skill: "impeccable", args: "shape" }, env).deny).toMatch(/CONTINUATION/)
    expect(pre("Skill", { skill: "impeccable", args: "polish" }, env).deny).toBeUndefined()
  })

  it("refuses the measure readers and scoring agents in the build phase only", () => {
    const build = { WAYFINDER_PHASE: "build" }
    expect(pre("Read", { file_path: `${ROOT}/.claude/skills/evaluate/SKILL.md` }, build).deny).toMatch(/BUILD PHASE/)
    expect(pre("Agent", { description: "critique the queue", prompt: "run critique" }, build).deny).toMatch(/BUILD PHASE/)
    expect(pre("Agent", { description: "find the call sites", prompt: "grep for postBill" }, build).deny).toBeUndefined()
    expect(pre("Agent", { description: "critique the queue", prompt: "run critique" }, { WAYFINDER_PHASE: "measure" }).deny).toBeUndefined()
  })

  it("refuses a whole lessons read in the spec phase", () => {
    expect(pre("Bash", { command: "cat scripts/wayfinder-autopilot/lessons.md" }, { WAYFINDER_PHASE: "spec" }).deny).toMatch(/LESSONS/)
    expect(pre("Bash", { command: "node scripts/wayfinder-autopilot/lessons.mjs --kind surface" }, { WAYFINDER_PHASE: "spec" }).deny).toBeUndefined()
  })
})

describe("token-guard: bash dead ends", () => {
  it.each([
    ["npm run dev", /DEV SERVER/],
    ["nohup node server.js", /DEV SERVER/],
    ["node server.js &", /DEV SERVER/],
    ["impeccable live-server --port 8400", /DEV SERVER/],
  ])("refuses `%s`", (command, msg) => {
    expect(pre("Bash", { command }).deny).toMatch(msg)
  })

  it("refuses background commands", () => {
    expect(pre("Bash", { command: "ls", run_in_background: true }).deny).toMatch(/NO BACKGROUND/)
  })

  it("refuses a capture round without a long timeout", () => {
    expect(pre("Bash", { command: "node .scratch/round-1.mjs" }).deny).toMatch(/CAPTURE ROUND/)
    expect(pre("Bash", { command: "node .scratch/round-1.mjs", timeout: 600000 }).deny).toBeUndefined()
  })

  it("lets an ordinary command through", () => {
    expect(pre("Bash", { command: "git status" }).deny).toBeUndefined()
  })
})

describe("token-guard: design gate", () => {
  it("refuses a rendering edit until craft-floor.md is read, never a backend one", () => {
    const r = repo()
    expect(pre("Edit", { file_path: "components/queue/row.tsx" }, {}, r).deny).toMatch(/DESIGN GATE/)
    expect(pre("Edit", { file_path: "lib/post.ts" }, {}, r).deny).toBeUndefined()
    expect(pre("Edit", { file_path: "app/api/x/route.ts" }, {}, r).deny).toBeUndefined()
    pre("Read", { file_path: `${ROOT}/.claude/skills/impeccable/reference/craft-floor.md` }, {}, r)
    expect(pre("Edit", { file_path: "components/queue/row.tsx" }, {}, r).deny).toBeUndefined()
  })
})

describe("token-guard: files the tool folder refuses", () => {
  it("refuses a new one-off script in the tool folder", () => {
    expect(pre("Write", { file_path: `${ROOT}/scripts/wayfinder-autopilot/tmp-q7.mjs`, content: "" }).deny).toMatch(/SCRATCH/)
  })

  it("refuses a round script that does not use capture-round", () => {
    const file_path = path.join(dir, "round-1.mjs")
    expect(pre("Write", { file_path, content: "const x = document.activeElement" }).deny).toMatch(/ROUND SCRIPT/)
    expect(pre("Write", { file_path, content: 'import { round } from "../capture-round.mjs"\nround()' }).deny).toBeUndefined()
  })

  it("refuses a hand-off over the line limit", () => {
    const hand = path.join(dir, "7.handoff.md")
    writeFileSync(hand, "milestone: spec-done\n")
    const env = { WAYFINDER_HANDOFF_FILE: hand }
    expect(pre("Write", { file_path: hand, content: "l\n".repeat(100) }, env).deny).toMatch(/HAND-OFF TOO LONG/)
    expect(pre("Write", { file_path: hand, content: "l\n".repeat(20) }, env).deny).toBeUndefined()
  })
})

describe("token-guard: commit and close gates", () => {
  it("refuses a backend logic commit without a test, allows it with one or with no-test:", () => {
    const r = repo()
    mkdirSync(path.join(r, "lib"))
    writeFileSync(path.join(r, "lib/post.ts"), "export const a = 1\n")
    gitIn(r, "add", "lib/post.ts")
    expect(pre("Bash", { command: 'git commit -m "feat: post"' }, {}, r).deny).toMatch(/TESTS TRAVEL/)
    expect(pre("Bash", { command: 'git commit -m "refactor: rename no-test: mechanical"' }, {}, r).deny).toBeUndefined()
    writeFileSync(path.join(r, "lib/post.test.ts"), "")
    gitIn(r, "add", "lib/post.test.ts")
    expect(pre("Bash", { command: 'git commit -m "feat: post"' }, {}, r).deny).toBeUndefined()
  })

  it("refuses closing a backend ticket without a clean review line", () => {
    const r = repo()
    symlinkSync(path.join(ROOT, "node_modules"), path.join(r, "node_modules"))
    writeFileSync(path.join(r, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, strict: true }, include: ["lib"] }))
    mkdirSync(path.join(r, "lib"))
    writeFileSync(path.join(r, "lib/post.ts"), "export const a: number = 1\n")
    writeFileSync(path.join(r, "lib/post.test.ts"), "")
    gitIn(r, "add", ".")
    gitIn(r, "commit", "-qm", "fix(#7): post the bill")
    const rep = path.join(r, "docs/wayfinder-reports/900")
    mkdirSync(rep, { recursive: true })
    writeFileSync(path.join(rep, "7.md"), "scores: none\n")
    expect(pre("Bash", { command: "gh issue close 7" }, {}, r).deny).toMatch(/REVIEW GATE/)
    writeFileSync(path.join(rep, "7.md"), "scores: review: P0=0 P1=0 findings=x.md\n")
    expect(pre("Bash", { command: "gh issue close 7" }, {}, r).deny).toBeUndefined()
  }, 90_000)
})

describe("context-guard", () => {
  const post = (env: Record<string, string> = {}) =>
    hook("context-guard.sh", { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "ls" } }, env)

  it("is quiet under the line and says hand off once the driver signals", () => {
    expect(post().raw).toBe("")
    writeFileSync(ctx, "160000 150000\n")
    writeFileSync(`${ctx}.signal`, "")
    expect(post().context).toMatch(/HAND-OFF NOW/)
  })

  it("nags once about an overlong hand-off", () => {
    const hand = path.join(dir, "7.handoff.md")
    writeFileSync(hand, "l\n".repeat(200))
    const env = { WAYFINDER_HANDOFF_FILE: hand }
    expect(post(env).context).toMatch(/HAND-OFF TOO LONG/)
    expect(post(env).raw).toBe("")
  })
})

describe("stop-guard", () => {
  const stop = (cwd: string, env: Record<string, string> = {}) =>
    hook("stop-guard.sh", { hook_event_name: "Stop" }, { WAYFINDER_PHASE: "build", ...env }, cwd)

  it("refuses to stop with uncommitted work and an unwritten hand-off, then lets go after the cap", () => {
    const r = repo()
    const hand = path.join(r, "7.handoff.md")
    writeFileSync(path.join(r, "README.md"), "changed\n")
    const env = { WAYFINDER_HANDOFF_FILE: hand }
    const first = stop(r, env).block
    expect(first).toMatch(/uncommitted work/)
    expect(first).toMatch(/hand-off/)
    expect(stop(r, env).block).toBeDefined()
    expect(stop(r, env).raw).toBe("")
  })

  it("lets a session with committed work and a written hand-off stop", () => {
    const r = repo()
    const hand = path.join(r, "7.handoff.md")
    writeFileSync(hand, "milestone: build-done\n")
    gitIn(r, "add", ".")
    gitIn(r, "commit", "-qm", "wip")
    expect(stop(r, { WAYFINDER_HANDOFF_FILE: hand }).raw).toBe("")
  })
})

describe("flail-guard", () => {
  const fail = (command: string, error: string, extra: object = {}) =>
    hook("flail-guard.sh", { hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command }, error, is_interrupt: false, ...extra })
  const ok = (tool_name: string, tool_input: object) =>
    hook("flail-guard.sh", { hook_event_name: "PostToolUse", tool_name, tool_input, tool_response: {} })
  const before = (command: string) =>
    hook("flail-guard.sh", { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } })
  const refused = "Exit code 7\ncurl: (7) Failed to connect to localhost port 3000 after 0 ms: Couldn't connect to server"

  it("stays quiet for two identical failures and speaks on the third", () => {
    expect(fail("curl localhost:3000", refused).raw).toBe("")
    expect(fail("curl localhost:3000", refused).raw).toBe("")
    expect(fail("curl localhost:3000", refused).context).toMatch(/SAME FAILURE 3×/)
  })

  it("counts one root cause across different commands and noisy numbers, pids and tmp paths", () => {
    fail("curl -s localhost:3000/app", "Exit code 7\ncurl: (7) Failed to connect to localhost port 3000 after 1 ms")
    fail("node /tmp/abc123/probe.mjs", "Exit code 7\ncurl: (7) Failed to connect to localhost port 3000 after 12 ms")
    expect(fail("curl localhost:3000/api", "Exit code 7\ncurl: (7) Failed to connect to localhost port 3000 after 3 ms").context).toMatch(/SAME FAILURE/)
  })

  it("does not pool different errors", () => {
    fail("npx vitest run a", "Exit code 1\nAssertionError: expected 1 to be 2")
    fail("npx vitest run a", "Exit code 1\nTypeError: x is not a function")
    expect(fail("npx vitest run a", "Exit code 1\nReferenceError: y is not defined").raw).toBe("")
  })

  it("ignores a bare exit code — a predicate's no (grep, test), not an error", () => {
    for (let i = 0; i < 4; i++) expect(fail("grep -n postBill lib/post.ts", "Exit code 1").raw).toBe("")
    expect(before("grep -n postBill lib/post.ts").raw).toBe("")
  })

  it("keys a short error by the command's first word", () => {
    fail("npx tsc", "Exit code 2\nfailed")
    fail("npx vitest", "Exit code 1\nfailed")
    expect(fail("node x.mjs", "Exit code 1\nfailed").raw).toBe("")
    expect(fail("npx eslint", "Exit code 1\nfailed").context).toMatch(/SAME FAILURE 3×/)
  })

  it("ignores interrupts", () => {
    for (let i = 0; i < 3; i++) expect(fail("sleep 99", "Interrupted", { is_interrupt: true }).raw).toBe("")
  })

  it("refuses a fourth identical run with nothing done in between, and allows it after another action", () => {
    for (let i = 0; i < 3; i++) fail("curl localhost:3000", refused)
    expect(before("curl localhost:3000").deny).toMatch(/SAME FAILURE/)
    expect(before("curl localhost:8400").deny).toBeUndefined()
    ok("Bash", { command: "node scripts/dev/dev.mjs start acme" })
    expect(before("curl localhost:3000").deny).toBeUndefined()
  })

  it("re-arms when the same failure comes back after the unlock", () => {
    for (let i = 0; i < 3; i++) fail("curl localhost:3000", refused)
    ok("Edit", { file_path: "lib/a.ts" })
    expect(fail("curl localhost:3000", refused).context).toMatch(/SAME FAILURE 4×/)
    expect(before("curl localhost:3000").deny).toMatch(/SAME FAILURE/)
  })

  it("tells the session to hand off at twice the cap", () => {
    for (let i = 0; i < 5; i++) fail("curl localhost:3000", refused)
    expect(fail("curl localhost:3000", refused).context).toMatch(/HAND OFF/)
  })

  it("counts a repeated Edit failure on the same file", () => {
    const e = (f: string) =>
      hook("flail-guard.sh", { hook_event_name: "PostToolUseFailure", tool_name: "Edit", tool_input: { file_path: f }, error: "String to replace not found in file." })
    e("lib/a.ts")
    e("lib/b.ts")
    expect(e("lib/a.ts").raw).toBe("")
    expect(e("lib/a.ts").context).toMatch(/SAME FAILURE 3×/)
  })

  it("does nothing on a success when nothing has tripped", () => {
    expect(ok("Bash", { command: "ls" }).raw).toBe("")
  })
})

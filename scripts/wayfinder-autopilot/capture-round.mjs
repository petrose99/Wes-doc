// Shared capture runner for the close phase. One round = every state × every
// width → PNGs + in-page detector findings + keyboard probes, written as
// shots-<round>/detector.json and keyboard.json beside the PNGs.
//
// #257 spent four close-phase sessions (63 tool calls) writing and debugging
// this plumbing per ticket — the detector injection, residue filtering,
// per-state isolation, offline toggling, JSON outputs. It is now shared: a
// ticket's round script only lists its states and the clicks between them.
//
// Usage (from the ticket's scratch folder, Playwright installed there):
//   import { round } from "<repo>/scripts/wayfinder-autopilot/capture-round.mjs"
//   await round({ out: "shots-r1", base: "http://localhost:3000/workspaces/<ws>" },
//     async ({ width, base, state, keyboard }) => {
//       await state("01-list", `${base}/approvals/invoices`, async (page, s) => {
//         await s.snap()                                   // "01-list-<width>.png" + detector
//         if (width === 390) keyboard("list-tab-walk", await s.tabWalk(22))
//         await page.getByRole("button", { name: /^filter/i }).click()
//         await s.snap("filter-sheet", "sheet open")        // "01-list-filter-sheet-<width>.png"
//         await s.offline(true); await s.snap("offline"); await s.offline(false)
//       })
//     })
//
// Every state runs in a fresh browser context inside its own try/catch: a
// selector that times out records `error` on that state and the round moves
// on — it never aborts the width (round 1 of #257 lost 9 states that way).
// Options: widths [1440, 390] · detectUrl http://localhost:8400/detect.js ·
// residue (regex of detector noise to exclude from realCount) · chromium (pass
// Playwright's chromium when it cannot be resolved from the working directory)
// · navTimeout 120000 · settle 500 (ms after each action before a screenshot).
//
// Before the browser opens, round() checks that `base` and `detectUrl` answer
// and throws naming `node .impeccable/live/dev.mjs start <ws>` if not — a
// missing live-server used to surface as `detector-error` on every state,
// read as real findings (#266 G2).
//
// Probes (on `s`, all shared — a round script never re-implements them; #266
// lost a session to its own `focused()` string compare and an unscoped `li`):
//   s.focusIs(/pattern/)            → { ok, focused }
//   s.visible(locator, ms?)         → true|false, waits up to ms (default 5000)
//   s.hidden(locator, ms?)          → true|false
//   s.count(selector, within?)      → number, scoped to `within` locator when given
//   s.dialog()                      → page.getByRole("dialog") (scope other locators to it)
//   s.waitFor(() => cond, ms?)      → true|false; polls a page-side predicate
//   s.probe(name, ok, detail?)      → records a keyboard/behaviour probe {state, ok, reason}
//   s.uniqueFile(path)              → copy of a fixture with a unique trailer,
//                                     so a re-run never trips the sha256 dedup guard
// `roundArgs()` parses `--out <dir>` / `--only <substr>` / `--width <n>` and a
// positional out dir, so a script called either way lands in the right folder.
import { writeFileSync, mkdirSync, copyFileSync, appendFileSync } from "node:fs"
import { resolve, basename, extname } from "node:path"
import { createRequire } from "node:module"
import { randomBytes } from "node:crypto"

export function roundArgs(argv = process.argv.slice(2)) {
  const a = { out: null, only: null, widths: null }
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]
    if (v === "--out") a.out = argv[++i]
    else if (v.startsWith("--out=")) a.out = v.slice(6)
    else if (v === "--only") a.only = argv[++i]
    else if (v.startsWith("--only=")) a.only = v.slice(7)
    else if (v === "--width") a.widths = [Number(argv[++i])]
    else if (v.startsWith("--width=")) a.widths = [Number(v.slice(8))]
    else if (v.startsWith("--")) throw new Error(`roundArgs(): unknown flag ${v}`)
    else if (!a.out) a.out = v
  }
  if (!a.out) throw new Error("roundArgs(): pass the output dir (`shots-r1` or `--out shots-r1`)")
  return a
}

async function preflight(base, detectUrl) {
  const check = async (url, what) => {
    try { const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) }); if (r.status < 500) return }
    catch {}
    throw new Error(`round(): ${what} is not answering at ${url} — run \`node .impeccable/live/dev.mjs start <ws>\` (brings up :3000 and the :8400 live-server, waits for both) before the round`)
  }
  await check(base, "the dev server"); await check(detectUrl, "the impeccable live-server (in-page detector)")
}

const DEFAULT_RESIDUE = /workspace-switcher|avatar|overused-font|nextjs-portal|next-dev|dev-overlay/i

async function loadChromium(given) {
  if (given) return given
  try { return createRequire(resolve(process.cwd(), "package.json"))("playwright").chromium } catch {}
  return (await import("playwright")).chromium
}

export async function round(opts, body) {
  const {
    out, base, widths = [1440, 390], detectUrl = "http://localhost:8400/detect.js",
    residue = DEFAULT_RESIDUE, navTimeout = 120000, settle = 500, only = null,
  } = opts
  if (!out || !base) throw new Error("round(): `out` and `base` are required")
  if (/^--/.test(out)) throw new Error(`round(): out dir is "${out}" — the script passed a flag as the positional arg; use roundArgs()`)
  await preflight(base, detectUrl)
  const OUT = resolve(out)
  mkdirSync(OUT, { recursive: true })
  mkdirSync(`${OUT}/fixtures`, { recursive: true })
  const chromium = await loadChromium(opts.chromium)
  const states = []
  const keyboardLog = []
  const keyboard = (name, data) => { keyboardLog.push(typeof data === "object" && !Array.isArray(data) ? { state: name, ...data } : { state: name, seq: data }) }
  const browser = await chromium.launch()

  async function detect(page) {
    try {
      if (!(await page.evaluate(() => navigator.onLine))) return [{ type: "skipped-offline" }]
      await page.addScriptTag({ url: detectUrl })
      await page.waitForTimeout(400)
      const groups = await page.evaluate(async () => {
        const g = await window.impeccableDetectAsync({})
        document.querySelectorAll(".impeccable-overlay, [class*=impeccable-]").forEach((e) => e.remove())
        return g
      })
      const flat = []
      for (const g of groups) for (const f of g.findings ?? []) flat.push({
        type: f.type || f.id || g.id,
        sel: (f.selector || f.path || "").slice(0, 120),
        detail: (f.detail || f.message || f.snippet || "").slice(0, 160),
      })
      return flat
    } catch (e) { return [{ type: "detector-error", detail: String(e.message).slice(0, 160) }] }
  }

  const focusedOf = (page) => page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return "body"
    const name = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || ""
    const role = el.getAttribute("role") ? `[${el.getAttribute("role")}]` : ""
    const id = el.id ? `#${el.id}` : ""
    return `${el.tagName.toLowerCase()}${role}${id}:${name}`
  })

  for (const width of widths) {
    async function state(name, url, fn) {
      if (only && !name.includes(only)) return
      const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion: "reduce" })
      const page = await ctx.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
      const s = {
        page, ctx, width,
        async snap(suffix = "", note = "") {
          // Playwright's default mouse position is (0,0), which sits directly on this app's
          // collapsed left nav rail and triggers its hover-expand — every capture across every
          // ticket showed the rail permanently expanded over content until this moved the mouse
          // off it first (#258 close phase: misread as a real P0 occlusion).
          await page.mouse.move(width - 5, Math.round((width < 600 ? 844 : 900) / 2))
          await page.waitForTimeout(settle)
          const label = suffix ? `${name}-${suffix}` : name
          const shot = `${OUT}/${label}-${width}.png`
          await page.screenshot({ path: shot, timeout: 90000 })
          const findings = await detect(page)
          const real = findings.filter((f) => !residue.test(f.type + f.sel + f.detail))
          states.push({ name: label, width, note, findings, realCount: real.length, shot, pageErrors: errors.splice(0) })
          console.log(`${label}@${width}: ${findings.length} findings (${real.length} non-residue)${note ? " " + note : ""}`)
        },
        focused: () => focusedOf(page),
        async focusIs(re) { const focused = await focusedOf(page); return { ok: re.test(focused), focused } },
        async visible(loc, ms = 5000) { try { await loc.first().waitFor({ state: "visible", timeout: ms }); return true } catch { return false } },
        async hidden(loc, ms = 5000) { try { await loc.first().waitFor({ state: "hidden", timeout: ms }); return true } catch { return false } },
        count: (selector, within) => (within ?? page).locator(selector).count(),
        dialog: () => page.getByRole("dialog"),
        async waitFor(fn, ms = 8000) { try { await page.waitForFunction(fn, null, { timeout: ms }); return true } catch { return false } },
        probe(pname, ok, detail = "") { keyboard(`${name}-${pname}`, { ok: !!ok, reason: ok ? "" : String(detail), width }) },
        uniqueFile(src) {
          const dst = `${OUT}/fixtures/${basename(src, extname(src))}-${randomBytes(4).toString("hex")}${extname(src)}`
          copyFileSync(src, dst)
          appendFileSync(dst, `\n%% round fixture ${randomBytes(8).toString("hex")}\n`)
          return dst
        },
        async tabWalk(n = 20, key = "Tab") { const seq = []; for (let i = 0; i < n; i++) { await page.keyboard.press(key); seq.push(await focusedOf(page)) } return seq },
        async press(key) { await page.keyboard.press(key); return focusedOf(page) },
        offline: (on = true) => ctx.setOffline(on),
        url: () => page.url().replace(base, ""),
      }
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: navTimeout }).catch(() => page.waitForTimeout(3000))
        await page.waitForTimeout(800)
        await fn(page, s)
      } catch (e) {
        const msg = String(e.message).split("\n")[0].slice(0, 200)
        states.push({ name, width, error: msg, findings: [], realCount: 0, pageErrors: errors.splice(0) })
        console.log(`${name}@${width}: ERROR ${msg}`)
      } finally { await ctx.close().catch(() => {}) }
    }
    try { await body({ width, base, state, keyboard, browser }) }
    catch (e) { console.log(`ROUND ERROR at ${width}: ${String(e.message).split("\n")[0]}`) }
  }
  await browser.close()
  writeFileSync(`${OUT}/detector.json`, JSON.stringify(states, null, 2))
  writeFileSync(`${OUT}/keyboard.json`, JSON.stringify(keyboardLog, null, 2))
  const byType = {}
  for (const st of states) for (const f of st.findings) byType[f.type] = (byType[f.type] ?? 0) + 1
  const errored = states.filter((st) => st.error).map((st) => `${st.name}@${st.width}`)
  console.log(`states: ${states.length}, real findings: ${states.reduce((a, st) => a + st.realCount, 0)}, errored: ${errored.length ? errored.join(", ") : "none"}`)
  console.log("by type:", JSON.stringify(byType))
  return { states, keyboard: keyboardLog, out: OUT }
}

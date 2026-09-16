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
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { createRequire } from "node:module"

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
  const OUT = resolve(out)
  mkdirSync(OUT, { recursive: true })
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
    return `${el.tagName.toLowerCase()}${role}:${name}`
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

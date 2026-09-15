// Impeccable in-page detector runner (#225). Needs `playwright` resolvable from the cwd it runs in
// (install it in the session scratchpad, run from there: `node <repo>/scripts/dev/detect-in-page.mjs …`)
// and `impeccable live-server --background` on :8400. Prints per-width counts; --verbose lists each finding.
// Usage: node detect.mjs <label> <url> [--click=<selector>] [--shot=<file>] [--widths=1440,390]
// Injects impeccable's in-page detector into the running dev server page and prints counts.
import { chromium } from "playwright"

const [label, url, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((a) => { const i = a.indexOf("="); const k = a.replace(/^--/, "").split("=")[0]; const v = i >= 0 ? a.slice(i + 1) : undefined; return [k, v ?? true] }))
const widths = (opt.widths ?? "1440,390").split(",").map(Number)
const browser = await chromium.launch()
const out = []
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 900 } })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 })
  if (opt.click) {
    await page.mouse.move(width / 2, 400)
    await page.locator(opt.click).first().click()
    if (opt.wait) await page.locator(opt.wait).first().waitFor({ timeout: 60000 }).catch((e) => console.log("wait failed:", e.message.split("\n")[0]))
    await page.waitForTimeout(800)
    await page.waitForLoadState("networkidle")
  }
  if (opt.key) { await page.keyboard.press(opt.key); await page.waitForTimeout(500) }
  if (opt.shot && opt.nodetect) { await page.screenshot({ path: opt.shot.replace(".png", `-${width}.png`), fullPage: false }); await page.close(); continue }
  await page.addScriptTag({ url: "http://localhost:8400/detect.js" })
  await page.waitForTimeout(800)
  const findings = await page.evaluate(async () => {
    const f = await window.impeccableDetectAsync({})
    return f
  })
  const flat = []
  for (const group of findings) for (const f of group.findings ?? []) flat.push({ type: f.type || f.id, detail: (f.detail || f.snippet || "").slice(0, 140), el: group.el?.slice?.(0, 100) ?? group.selector ?? "" })
  const byType = {}
  for (const f of flat) byType[f.type] = (byType[f.type] ?? 0) + 1
  out.push({ label, width, count: flat.length, byType, errors })
  if (opt.shot) await page.screenshot({ path: opt.shot.replace(".png", `-${width}.png`), fullPage: false })
  if (opt.verbose) for (const f of flat) console.log(`  [${width}] ${f.type}: ${f.detail} :: ${f.el}`)
  await page.close()
}
await browser.close()
for (const o of out) console.log(`${o.label} @${o.width}: ${o.count} findings ${JSON.stringify(o.byType)}${o.errors.length ? " pageErrors=" + JSON.stringify(o.errors.slice(0, 2)) : ""}`)

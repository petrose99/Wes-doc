// #252 Playwright pass — run from the scratchpad (playwright resolves there):
//   node .impeccable/live/verify252.mjs shots|detect|keys|all [verbose]
// Screenshots go to .impeccable/live/shots252/, detector counts print per surface and width.
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const WS = process.env.WS ?? "af91555d-7450-4b21-a8ac-73db092617c8"
const BASE = `http://localhost:3000/workspaces/${WS}`
const OUT = "/home/ubuntu/Dev/Wes-doc/.impeccable/live/shots252"
const mode = process.argv[2] ?? "all"
const verbose = process.argv.includes("verbose")
const onlyArg = process.argv.slice(3).find((a) => a !== "verbose")
const only = onlyArg ? onlyArg.split(",") : null
mkdirSync(OUT, { recursive: true })

/** Surfaces and states. `prep` runs before the detector/screenshot to reach a state. */
const SURFACES = [
  { key: "fields", url: `${BASE}/admin/configuration` },
  { key: "fields-dirty", url: `${BASE}/admin/configuration`, prep: async (page) => { await page.getByLabel("Due date editable").click(); await page.waitForTimeout(400) } },
  { key: "fields-receipt", url: `${BASE}/admin/configuration?type=receipt` },
  { key: "autonomy", url: `${BASE}/admin/configuration/autonomy` },
  { key: "autonomy-dirty", url: `${BASE}/admin/configuration/autonomy`, prep: async (page) => { await page.getByLabel("QA sample rate").fill("0.07"); await page.waitForTimeout(400) } },
  { key: "checks", url: `${BASE}/admin/configuration/checks` },
  { key: "report", url: `${BASE}/admin/configuration/report` },
  { key: "intake", url: `${BASE}/admin/configuration/intake` },
  { key: "tax", url: `${BASE}/admin/configuration/tax` },
  { key: "payments", url: `${BASE}/admin/configuration/payments` },
  { key: "whats-on", url: `${BASE}/admin/configuration/whats-on` },
  { key: "approval-flows", url: `${BASE}/admin/approval-flows` },
  { key: "po-mismatch-flows", url: `${BASE}/admin/po-mismatch-flows` },
  { key: "suppliers", url: `${BASE}/admin/suppliers` },
  { key: "integrations", url: `${BASE}/admin/integrations` },
  { key: "users", url: `${BASE}/admin/users` },
  { key: "companies", url: `${BASE}/admin/companies` },
  { key: "account", url: `${BASE}/account` },
  { key: "account-security", url: `${BASE}/account/security` },
  { key: "account-menu", url: `${BASE}/close`, prep: async (page, width) => { if (width < 768) return; await page.locator("aside button[aria-haspopup=menu]").first().click(); await page.waitForTimeout(400) } },
  { key: "invoices-console", url: `${BASE}/invoices`, prep: async (page) => { page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("   console:", m.text().slice(0, 300)) }); await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(500) } },
]

const browser = await chromium.launch()

async function open(width, url) {
  const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 900 } })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  await page.goto(url, { waitUntil: "networkidle", timeout: 180000 })
  // Park the mouse off the rail so the collapsed rail stays collapsed in screenshots.
  await page.mouse.move(Math.min(width - 20, 900), 500)
  await page.waitForTimeout(200)
  return { page, errors }
}

async function detect(page) {
  // The collapsed rail expands under a hover; headless Chromium parks the mouse at (0,0), which
  // is the rail. Park it over the page body so the detector sees the resting state.
  await page.mouse.move(900, 500)
  await page.waitForTimeout(250)
  await page.addScriptTag({ url: "http://localhost:8400/detect.js" })
  await page.waitForTimeout(600)
  const findings = await page.evaluate(async () => window.impeccableDetectAsync({}))
  const flat = []
  for (const group of findings) for (const f of group.findings ?? []) flat.push({ type: f.type || f.id, detail: (f.detail || f.snippet || "").slice(0, 150), el: group.el?.slice?.(0, 110) ?? group.selector ?? "" })
  return flat
}

if (mode === "shots" || mode === "detect" || mode === "all") {
  for (const s of SURFACES) {
    if (only && !only.includes(s.key)) continue
    for (const width of [1440, 390]) {
      const { page, errors } = await open(width, s.url)
      try {
        if (s.prep) await s.prep(page, width)
        if (mode !== "detect") await page.screenshot({ path: `${OUT}/${s.key}-${width}.png`, fullPage: false })
        if (mode !== "shots") {
          const flat = await detect(page)
          const byType = {}
          for (const f of flat) byType[f.type] = (byType[f.type] ?? 0) + 1
          console.log(`${s.key} @${width}: ${flat.length} ${JSON.stringify(byType)}${errors.length ? " pageErrors=" + JSON.stringify(errors.slice(0, 2)) : ""}`)
          if (verbose) for (const f of flat) console.log(`   ${f.type}: ${f.detail} :: ${f.el}`)
        } else if (errors.length) console.log(`${s.key} @${width}: pageErrors=${JSON.stringify(errors.slice(0, 2))}`)
      } catch (e) { console.log(`${s.key} @${width}: FAILED ${e.message.split("\n")[0]}`) }
      await page.close()
    }
  }
}

if (mode === "keys" || mode === "all") {
  // Keyboard flow on the Fields page at both widths: Tab from the top, the tablist arrows,
  // the first checkbox, Space toggles it, the save bar appears and is reachable.
  for (const width of [1440, 390]) {
    const { page } = await open(width, `${BASE}/admin/configuration`)
    const trail = []
    const active = () => page.evaluate(() => { const a = document.activeElement; return `${a?.tagName.toLowerCase()}${a?.getAttribute("aria-label") ? `[${a.getAttribute("aria-label")}]` : ""}${a?.textContent?.trim() ? ` "${a.textContent.trim().slice(0, 28)}"` : ""}` })
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab")
      const a = await active()
      trail.push(a)
      if (a.includes("[Due date editable]")) break
    }
    console.log(`keys @${width}: ${trail.length} Tabs to the first field control; trail: ${trail.slice(-6).join(" → ")}`)
    // tablist
    await page.getByRole("tab", { name: "Invoice" }).focus()
    await page.keyboard.press("ArrowRight")
    console.log(`keys @${width}: ArrowRight on the tablist focuses ${await active()}`)
    // toggle + save bar
    await page.getByLabel("Due date editable").focus()
    await page.keyboard.press("Space")
    await page.waitForTimeout(300)
    const bar = await page.getByRole("button", { name: "Save changes" }).isVisible().catch(() => false)
    const unsaved = await page.getByText("Unsaved changes").isVisible().catch(() => false)
    console.log(`keys @${width}: after Space — Save visible=${bar}, Unsaved marker=${unsaved}`)
    // reach the save bar by Tab from the last row's control
    await page.getByLabel(/Move .* down/).last().focus()
    await page.keyboard.press("Tab")
    console.log(`keys @${width}: Tab past the last row lands on ${await active()}`)
    await page.keyboard.press("Tab")
    await page.keyboard.press("Enter") // Discard
    await page.waitForTimeout(300)
    console.log(`keys @${width}: after Discard — Save visible=${await page.getByRole("button", { name: "Save changes" }).isVisible().catch(() => false)}`)
    await page.screenshot({ path: `${OUT}/keys-${width}.png` })
    await page.close()
  }
  // Dirty guard: edit, then click a nav link — the confirm must fire; decline keeps the page.
  {
    const { page } = await open(1440, `${BASE}/admin/configuration`)
    await page.getByLabel("Due date editable").click()
    let asked = null
    page.once("dialog", async (d) => { asked = d.message().slice(0, 80); await d.dismiss() })
    await page.getByRole("tab", { name: "Receipt" }).click()
    await page.waitForTimeout(600)
    console.log(`guard: confirm asked=${JSON.stringify(asked)}; still on Fields=${page.url().endsWith("/admin/configuration")}; Unsaved marker=${await page.getByText("Unsaved changes").isVisible()}`)
    await page.close()
  }
  // Back button while dirty: asks; declining stays; accepting leaves.
  {
    const { page } = await open(1440, `${BASE}/admin/configuration/tax`)
    await page.getByRole("link", { name: "Fields" }).click()
    await page.waitForURL(/admin\/configuration$/)
    await page.waitForLoadState("networkidle")
    await page.getByLabel("Due date editable").click()
    await page.waitForTimeout(400)
    let asked = 0
    page.on("dialog", async (d) => { asked++; if (asked === 1) await d.dismiss(); else await d.accept() })
    await page.goBack()
    await page.waitForTimeout(800)
    const stayed = page.url().endsWith("/admin/configuration")
    await page.goBack()
    await page.waitForTimeout(1500)
    console.log(`back guard: asked=${asked}; declined→stayed=${stayed}; accepted→now at ${page.url().replace(BASE, "")}`)
    // ⌘S saves
    await page.close()
  }
  {
    const { page } = await open(1440, `${BASE}/admin/po-mismatch-flows`)
    const input = page.getByLabel("Quantity tolerance")
    const before = await input.inputValue()
    await input.fill(String(Number(before) + 1))
    await page.keyboard.press("Control+s")
    await page.waitForTimeout(1500)
    const saved = await page.getByText("Saved", { exact: true }).isVisible().catch(() => false)
    await input.fill(before)
    await page.getByRole("button", { name: "Save changes" }).click()
    await page.waitForTimeout(1200)
    console.log(`ctrl+s on tolerance: Saved shown=${saved}; restored to ${before}`)
    await page.close()
  }
  // Phone: the save bar sits above the tab bar after an edit.
  {
    const { page } = await open(390, `${BASE}/admin/configuration`)
    await page.getByLabel("Due date editable").click()
    await page.waitForTimeout(400)
    const box = await page.getByRole("button", { name: "Save changes" }).boundingBox()
    console.log(`phone save bar: ${JSON.stringify(box)} (viewport 844; tab bar ~72px)`)
    await page.screenshot({ path: `${OUT}/fields-dirty-390.png` })
    await page.close()
  }
  // Admin nav: aria-current and landmarks
  const { page } = await open(1440, `${BASE}/admin/configuration/tax`)
  const facts = await page.evaluate(() => ({
    navs: [...document.querySelectorAll("nav")].map((n) => n.getAttribute("aria-label")),
    mains: document.querySelectorAll("main, [role=main]").length,
    current: [...document.querySelectorAll("[aria-current=page]")].map((a) => a.textContent.trim()),
    h1: document.querySelectorAll("h1").length,
    headings: [...document.querySelectorAll("h1,h2,h3")].map((h) => h.tagName + ":" + h.textContent.trim().slice(0, 30)),
  }))
  console.log("landmarks:", JSON.stringify(facts))
  await page.close()
}

await browser.close()

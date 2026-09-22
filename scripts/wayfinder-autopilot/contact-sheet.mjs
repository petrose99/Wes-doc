#!/usr/bin/env node
// Tile a capture round's PNGs into one contact sheet, so a session reads one
// image instead of forty. Renders an HTML grid with Playwright's Chromium
// (already installed for the capture runner) and screenshots it.
//   node contact-sheet.mjs <png-dir-or-files...> --out sheet.png [--tile 300] [--cols 4] [--playwright <dir>]
// Copy this file beside the scratch Playwright install (it resolves
// `playwright` from its own location) or pass --playwright <dir>.
import { createRequire } from "node:module"
import { readdirSync, statSync, mkdtempSync, writeFileSync } from "node:fs"
import { join, basename, resolve } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d }
const out = resolve(opt("--out", "contact-sheet.png"))
const tile = Number(opt("--tile", 300)), cols = Number(opt("--cols", 4))
const pwDir = opt("--playwright", "")
const inputs = args.length ? args : ["."]
const files = inputs.flatMap(p => statSync(p).isDirectory()
  ? readdirSync(p).filter(f => /\.(png|jpe?g)$/i.test(f)).sort().map(f => join(p, f))
  : [p]).map(f => resolve(f))
if (!files.length) { console.error("no images"); process.exit(1) }

const require = createRequire(pwDir ? join(resolve(pwDir), "package.json") : import.meta.url)
const { chromium } = require("playwright")

const html = `<!doctype html><meta charset=utf-8><style>
body{margin:0;background:#fff;font:11px/1.3 system-ui,sans-serif;color:#111}
.g{display:grid;grid-template-columns:repeat(${cols},${tile}px);gap:8px;padding:8px;width:max-content}
figure{margin:0;border:1px solid #ddd;background:#f6f6f6}
img{display:block;width:${tile}px;height:auto;max-height:${Math.round(tile * 1.6)}px;object-fit:cover;object-position:top}
figcaption{padding:3px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-top:1px solid #ddd;background:#fff}
</style><div class=g>${files.map(f => `<figure><img src="${pathToFileURL(f).href}"><figcaption>${basename(f)}</figcaption></figure>`).join("")}</div>`
const page = join(mkdtempSync(join(tmpdir(), "sheet-")), "sheet.html"); writeFileSync(page, html)

const browser = await chromium.launch()
const p = await browser.newPage({ viewport: { width: cols * (tile + 8) + 16, height: 800 } })
await p.goto(pathToFileURL(page).href, { waitUntil: "load" })
await p.screenshot({ path: out, fullPage: true })
await browser.close()
console.log(`${files.length} images → ${out}`)

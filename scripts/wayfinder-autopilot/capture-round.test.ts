import { mkdtempSync, readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { chromium } from "playwright"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
// @ts-expect-error — plain .mjs module, no types
import { round } from "./capture-round.mjs"

// #462's close lost two sessions to a blank "Post failed" capture: the pane
// renders its content ~2 s after network idle, first behind the route's
// Suspense spinner, then (after a gap with neither) behind its own skeleton.
// snap() now waits until no loading indicator has been visible for a quiet
// window, so a round captures the settled page, not the first spinner.

const PAGES: Record<string, string> = {
  // spinner 1.5 s → nothing 0.3 s → skeleton 1.5 s → content
  "/late": `<div id="root"><div class="animate-spin">…</div></div><script>
    const root = document.getElementById("root")
    setTimeout(() => { root.innerHTML = "" }, 1500)
    setTimeout(() => { root.innerHTML = '<div class="animate-pulse">skeleton</div>' }, 1800)
    setTimeout(() => { root.innerHTML = '<p id="ready">Post failed</p>' }, 3300)
  </script>`,
  // a state whose subject is a spinner that never stops ("Posting…")
  "/posting": `<div class="animate-spin" style="width:24px;height:24px;border:3px solid #999"></div> Posting…`,
  // settled page whose rows carry small inline spinners and a recording dot — content, not loading
  "/still": `<p id="ready">Queued <svg class="animate-spin" width="14" height="14"></svg></p>
    <span class="animate-pulse" style="display:inline-block;width:8px;height:8px"></span>`,
}

let server: Server
let base: string
const out = mkdtempSync(path.join(tmpdir(), "wf-round-"))

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/detect.js") {
      res.setHeader("content-type", "text/javascript")
      return res.end("window.impeccableDetectAsync = async () => []")
    }
    res.setHeader("content-type", "text/html")
    res.end(`<!doctype html><html><body>${PAGES[req.url ?? ""] ?? "ok"}</body></html>`)
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

async function capture(url: string, opts: object = {}) {
  let seen = -1
  const result = await round(
    { out: path.join(out, url.slice(1)), base, detectUrl: `${base}/detect.js`, widths: [390], chromium, ...opts },
    async ({ state }: { state: Function }) => {
      await state("s", `${base}${url}`, async (page: { locator: (s: string) => { count: () => Promise<number> } }, s: { snap: Function }) => {
        await s.snap()
        seen = await page.locator("#ready").count()
      })
    },
  )
  return { seen, state: result.states[0], json: JSON.parse(readFileSync(path.join(result.out, "detector.json"), "utf8"))[0] }
}

describe("capture-round snap()", () => {
  it("waits out a spinner, the gap after it and the skeleton that follows before the screenshot", async () => {
    const { seen, state } = await capture("/late")
    expect(seen).toBe(1)
    expect(state.loading).toBeUndefined()
  }, 30_000)

  it("captures a state whose spinner never stops after the ready timeout, and marks it loading", async () => {
    const t0 = Date.now()
    const { state, json } = await capture("/posting", { readyTimeout: 1500 })
    expect(Date.now() - t0).toBeLessThan(15_000)
    expect(state.error).toBeUndefined()
    expect(json.loading).toBe(true)
  }, 30_000)

  it("does not wait on a settled page's inline spinners and dots", async () => {
    const t0 = Date.now()
    const { seen, state } = await capture("/still")
    expect(seen).toBe(1)
    expect(state.loading).toBeUndefined()
    expect(Date.now() - t0).toBeLessThan(8_000)
  }, 30_000)
})

// Test just the first queue and first state
import { round } from "/home/ubuntu/Dev/Wes-doc/scripts/wayfinder-autopilot/capture-round.mjs"
import { chromium } from "playwright"

const WS = "af91555d-7450-4b21-a8ac-73db092617c8"
const BASE = `http://localhost:3000/workspaces/${WS}`
const OUT = "/home/ubuntu/Dev/Wes-doc/test-shots"

console.log("Starting test capture...")

try {
  await round({ out: OUT, base: BASE, widths: [1440], chromium, timeout: 10000 }, async ({ width, base, state }) => {
    console.log(`Processing width ${width}`)
    // Just capture the invoices-list state
    const url = `${base}/invoices`
    await state("invoices-list", url, async (page, s) => {
      console.log("Snapping invoices-list...")
      await s.snap()
      console.log("Done snapping")
    })
  })
  console.log("Test capture complete")
  process.exit(0)
} catch (e) {
  console.error("Test failed:", e.message, e.stack)
  process.exit(1)
}

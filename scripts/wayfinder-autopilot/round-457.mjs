// #457 capture round: Company currency (spec §6, 10 states × 1440/390). Run from repo root after
// `node .impeccable/live/dev.mjs start 9cdcdf3f-9608-47a1-8495-abb1e210871c` and
// `npx tsx --env-file .env scripts/dev/seed-457.ts`:
//   node scripts/wayfinder-autopilot/round-457.mjs <scratch>/shots-r0 [--only S4] [--width 390]
// No probe confirms a change (the seed would have to be re-run); dialogs are opened and cancelled.
import { readFileSync } from "node:fs"
import { round, roundArgs } from "./capture-round.mjs"

const RIVERSIDE = "9cdcdf3f-9608-47a1-8495-abb1e210871c"
const HARBOR = "a74a45c2-aa1a-4f75-8fe5-80011962c57d"
const NORTHWIND = "c5315ed3-053f-4dba-9821-ab1d085d405a"
const PERSONAL = "af91555d-7450-4b21-a8ac-73db092617c8"
const RESIDUE_FILE = "/home/ubuntu/Dev/Wes-doc/docs/wayfinder-reports/445/logs/scratch-457/residue.txt"
const residue = new RegExp(readFileSync(RESIDUE_FILE, "utf8").trim().split("\n").filter(Boolean).join("|"), "i")
const { out, only, widths } = roundArgs()
const W = "http://localhost:3000/workspaces"

await round({ out, base: `${W}/${RIVERSIDE}`, only, residue, ...(widths ? { widths } : {}) }, async ({ state }) => {
  // S1: /workspaces/new redirects any user with a membership (page.tsx guard), and the dev-bypass
  // user has several — so the LS state is captured on the Add company dialog, which renders the
  // same shared CompanyCountryCurrencyFields pair the new-company form does.
  await state("S1-new-company-ls", `${W}/${RIVERSIDE}/admin/companies`, async (page, s) => {
    const add = page.getByRole("button", { name: "Add a company" })
    if (!(await s.visible(add, 10000))) { s.probe("add-button-visible", false, "no Add a company button (hidden below md?)"); await s.snap("", "no Add button"); return }
    await add.click()
    const dlg = s.dialog()
    await s.visible(dlg)
    await dlg.getByLabel("Country").selectOption("LS")
    const currency = dlg.getByLabel("Company currency")
    s.probe("ls-currency-select", await s.visible(currency), "no Company currency select after picking Lesotho")
    const opts = await currency.locator("option").allTextContents()
    s.probe("ls-options-lsl-zar", opts.join(",") === "LSL,ZAR", `options: ${opts.join(",")}`)
    s.probe("ls-hint-described", (await currency.getAttribute("aria-describedby")) !== null, "currency select has no aria-describedby")
    await s.snap("", "Add company dialog, Lesotho: LSL/ZAR + peg hint")
    await dlg.getByLabel("Country").focus()
    const walk = await s.tabWalk(1)
    s.probe("tab-country-to-currency", /select.*currency/i.test(walk[0]) || /LSL/.test(walk[0]), `Tab from Country went to ${walk[0]}`)
  })

  await state("S2-add-company-za", `${W}/${RIVERSIDE}/admin/companies`, async (page, s) => {
    const add = page.getByRole("button", { name: "Add a company" })
    if (!(await s.visible(add, 10000))) { s.probe("add-button-visible", false, "no Add a company button (hidden below md?)"); await s.snap("", "no Add button"); return }
    await add.click()
    const dlg = s.dialog()
    await s.visible(dlg)
    await dlg.getByLabel("Country").selectOption("ZA")
    s.probe("za-no-select", (await s.count("select[name=baseCurrency]", dlg)) === 0, "ZA still renders a currency select")
    s.probe("za-hidden-input", (await s.count("input[type=hidden][name=baseCurrency][value=ZAR]", dlg)) === 1, "no hidden baseCurrency=ZAR")
    s.probe("za-hint", await s.visible(dlg.getByText("Companies in South Africa use ZAR.")), "ZA hint missing")
    await s.snap("", "Add company dialog, South Africa: ZAR fixed + hint")
  })

  await state("S3-row-owner-unlocked", `${W}/${RIVERSIDE}/admin/companies/${HARBOR}`, async (page, s) => {
    const change = page.getByRole("button", { name: "Change", exact: true })
    s.probe("change-visible", await s.visible(change, 15000), "no Change button on Harbor's Company currency row")
    await s.snap("", "Currency row, Owner, unlocked: LSL + Change")
  })

  await state("S4-change-dialog", `${W}/${RIVERSIDE}/admin/companies/${HARBOR}`, async (page, s) => {
    const change = page.getByRole("button", { name: "Change", exact: true })
    await s.visible(change, 15000)
    await change.focus()
    await page.keyboard.press("Enter")
    const dlg = s.dialog()
    s.probe("dialog-open", await s.visible(dlg), "Enter on Change opened no dialog")
    s.probe("title", await s.visible(dlg.getByText("Change the company currency to ZAR?")), "title missing")
    s.probe("count-14", await s.visible(dlg.getByText(/14 unposted documents will be re-converted to ZAR/)), "count line missing")
    const f = await s.focusIs(/Change to ZAR/)
    s.probe("focus-on-confirm", f.ok, `focus on ${f.focused}`)
    await s.snap("", "Change dialog, 14 unposted")
    await s.press("Escape")
    s.probe("esc-closes", await s.hidden(dlg), "Esc left the dialog open")
    const back = await s.focusIs(/^button.*Change$/)
    s.probe("esc-focus-return", back.ok, `focus after Esc on ${back.focused}`)
  })

  await state("S5-row-locked", `${W}/${RIVERSIDE}/admin/companies/${RIVERSIDE}`, async (page, s) => {
    const line = page.getByText(/LSL · locked since the first bill was posted to Xero on 12 Sep 2026/)
    s.probe("lock-line", await s.visible(line, 15000), "lock line missing")
    s.probe("no-change", (await page.getByRole("button", { name: "Change", exact: true }).count()) === 0, "locked row still offers Change")
    await s.snap("", "Currency row locked (bill, Xero)")
  })

  await state("S6-row-member", `${W}/${RIVERSIDE}/admin/companies/${NORTHWIND}`, async (page, s) => {
    await page.waitForTimeout(3000)
    s.probe("no-change", (await page.getByRole("button", { name: "Change", exact: true }).count()) === 0, "Member sees Change")
    await s.snap("", "Currency row as Member: plain LSL")
  })

  await state("S7-card-owner-switch", `${W}/${HARBOR}/admin/integrations`, async (page, s) => {
    const fact = page.getByText("Xero keeps its books in ZAR; this company's currency is LSL.")
    s.probe("fact-line", await s.visible(fact, 15000), "mismatch fact line missing")
    const sw = page.getByRole("button", { name: "Switch this company to ZAR" })
    s.probe("switch-visible", await s.visible(sw), "no Switch button")
    await sw.scrollIntoViewIfNeeded().catch(() => {})
    await s.snap("", "card mismatch, Owner: Switch")
    await sw.focus()
    await page.keyboard.press("Enter")
    const dlg = s.dialog()
    s.probe("switch-opens-dialog", await s.visible(dlg), "Switch opened no dialog")
    await s.snap("dialog", "Change dialog from the card")
    await s.press("Escape")
    await s.hidden(dlg)
    const back = await s.focusIs(/Switch this company to ZAR/)
    s.probe("esc-focus-return", back.ok, `focus after Esc on ${back.focused}`)
  })

  await state("S8-card-non-owner", `${W}/${NORTHWIND}/admin/integrations`, async (page, s) => {
    s.probe("ask-owner", await s.visible(page.getByText("Ask an Owner to change the company currency."), 15000), "Ask an Owner line missing")
    s.probe("no-switch", (await page.getByRole("button", { name: /Switch this company/ }).count()) === 0, "non-Owner sees Switch")
    await page.getByText(/Xero keeps its books/).scrollIntoViewIfNeeded().catch(() => {})
    await s.snap("", "card mismatch, non-Owner")
  })

  await state("S9-card-locked", `${W}/${RIVERSIDE}/admin/integrations`, async (page, s) => {
    const blocked = page.getByText(/Bills won't post until they match/)
    s.probe("blocked-line", await s.visible(blocked, 15000), "blocked outcome line missing")
    s.probe("no-switch", (await page.getByRole("button", { name: /Switch this company/ }).count()) === 0, "locked card offers Switch")
    await blocked.scrollIntoViewIfNeeded().catch(() => {})
    await s.snap("", "card mismatch, locked: blocked line")
  })

  await state("S10-amount-surface", `${W}/${PERSONAL}/invoices`, async (page, s) => {
    s.probe("lsl-amount", await s.visible(page.getByText(/LSL\s?[\d,]+\.\d\d/), 15000), "no LSL-formatted amount in the Invoices queue")
    await s.snap("", "Invoices queue: LSL amounts beside a USD document")
  })
})

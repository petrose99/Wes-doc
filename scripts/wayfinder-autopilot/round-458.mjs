// #458 capture round: the supplier table reads the set back (spec §6 States, S1–S6 × 1440/390 + the
// three keyboard probes). Run from repo root after `node .impeccable/live/dev.mjs start <maluti>` and
// `npx tsx --env-file .env scripts/dev/seed-458.ts` (re-seed before every round: S7 forgets a rule):
//   node scripts/wayfinder-autopilot/round-458.mjs <scratch>/shots-r0 [--only S4] [--width 390]
import { readFileSync } from "node:fs"
import { round, roundArgs } from "./capture-round.mjs"

const MALUTI = "af91555d-7450-4b21-a8ac-73db092617c8"
const HARBOR = "a74a45c2-aa1a-4f75-8fe5-80011962c57d"
const PINE = "60a2b427-9b0c-4a46-9390-ef7a91f6bd7d"
const NORTHWIND = "c5315ed3-053f-4dba-9821-ab1d085d405a"
const RESIDUE_FILE = new URL("../../docs/wayfinder-reports/445/logs/scratch-458/residue.txt", import.meta.url).pathname
const residue = new RegExp(readFileSync(RESIDUE_FILE, "utf8").trim().split("\n").filter(Boolean).join("|"), "i")
const { out, only, widths } = roundArgs()
const W = "http://localhost:3000/workspaces"
const page = (ws) => `${W}/${ws}/admin/integrations`
const forgetOf = (p, supplier) => p.getByRole("button", { name: `Forget ${supplier}'s usual account` })

async function toTable(p, s) {
  const intro = p.locator("#supplier-accounts-intro")
  const ok = await s.visible(intro, 20000)
  await intro.scrollIntoViewIfNeeded().catch(() => {})
  return ok
}

await round({ out, base: `${W}/${MALUTI}`, only, residue, ...(widths ? { widths } : {}) }, async ({ state }) => {
  await state("S1-qbo-mixed", page(MALUTI), async (p, s) => {
    s.probe("table", await toTable(p, s), "no #supplier-accounts-intro")
    const full = p.locator("tr", { hasText: "blue harbour cleaning" })
    s.probe("full-row", await s.visible(full.getByText("Tax code: Standard (15%)")) && await s.visible(full.getByText("Class: Operations")) && await s.visible(full.getByText("Location: Maseru branch")), "full row detail parts missing")
    s.probe("account-only-no-line", (await s.count("p.text-xs", p.locator("tr", { hasText: "city power" }))) === 0, "account-only row renders a detail line")
    s.probe("stale-class", await s.visible(p.locator("tr", { hasText: "greenleaf catering" }).getByText(/no longer in QuickBooks — not pre-filled/)), "stale Class parenthetical missing")
    s.probe("reminder", await s.visible(p.locator("tr", { hasText: "metro stationers" }).getByText(/posted bill.* still on/)), "reminder line missing")
    s.probe("intro-copy", await s.visible(p.getByText(/with that\s+line.s Tax code, Class and the bill.s Location/)), "intro copy does not name Class and Location")
    await s.snap("", "QBO: full, account-only, stale Class, reminder rows")
  })

  await state("S2-xero-two-tracking", page(HARBOR), async (p, s) => {
    s.probe("table", await toTable(p, s), "no #supplier-accounts-intro")
    const row = p.locator("tr", { hasText: "fresh farm produce" })
    s.probe("two-categories", await s.visible(row.getByText("Region: North")) && await s.visible(row.getByText("Department: Kitchen")), "two tracking parts missing")
    s.probe("intro-copy", await s.visible(p.getByText(/Tax code, Region and Department/)), "intro does not name Region and Department")
    await s.snap("", "Xero: two tracking categories")
  })

  await state("S3-empty", page(PINE), async (p, s) => {
    const empty = p.getByText(/Supplier accounts fill in as documents get approved/)
    s.probe("empty-copy", await s.visible(empty, 20000), "empty text missing")
    await empty.scrollIntoViewIfNeeded().catch(() => {})
    await s.snap("", "connected, no rules")
  })

  await state("S4-non-owner", page(NORTHWIND), async (p, s) => {
    s.probe("table", await toTable(p, s), "no #supplier-accounts-intro")
    s.probe("no-forget", (await s.count("[id^=forget-rule-]")) === 0, "Member sees Forget")
    s.probe("no-reminder-buttons", (await p.getByRole("button", { name: /^(Review|Leave them)$/ }).count()) === 0, "Member sees reminder buttons")
    s.probe("detail-line", await s.visible(p.getByText("Tax code: Standard Rate Purchases (15%)")), "detail line missing for Member")
    await s.snap("", "Member: no Forget column, detail line shown")
  })

  await state("S5-forget-confirm", page(MALUTI), async (p, s) => {
    await toTable(p, s)
    const opener = forgetOf(p, "blue harbour cleaning")
    const id = await opener.getAttribute("id")
    await opener.focus()
    await p.keyboard.press("Enter")
    const dlg = p.getByRole("alertdialog")
    s.probe("dialog-open", await s.visible(dlg), "Enter on Forget opened no dialog")
    s.probe("title", await s.visible(dlg.getByText("Forget blue harbour cleaning's usual account?")), "title missing")
    s.probe("names-parts", await s.visible(dlg.getByText(/and its Tax code, Class and Location for blue harbour cleaning/)), "description does not name the held parts")
    const f = await s.focusIs(/Cancel/)
    s.probe("initial-focus-cancel", f.ok, `focus on ${f.focused}`)
    await s.snap("", "Forget confirm open")
    await s.press("Escape")
    s.probe("esc-closes", await s.hidden(dlg), "Esc left the dialog open")
    const back = await s.focusIs(new RegExp(`#${id}:`))
    s.probe("esc-focus-return", back.ok, `focus after Esc on ${back.focused}, expected #${id}`)
  })

  await state("S6-forget-error", page(MALUTI), async (p, s) => {
    await toTable(p, s)
    await forgetOf(p, "city power").click()
    const dlg = p.getByRole("alertdialog")
    await s.visible(dlg)
    await s.offline(true)
    await dlg.getByRole("button", { name: "Forget", exact: true }).click()
    const alert = dlg.getByRole("alert")
    s.probe("alert-text", await s.visible(alert.getByText("Couldn't reach DocuBite. Check your connection and try again."), 15000), "offline alert missing")
    s.probe("dialog-still-open", await s.visible(dlg, 1000), "dialog closed on failure")
    await s.offline(false)
    await s.snap("", "Forget failed offline: alert inside the open dialog")
  })

  // Deletes one seeded "northside" rule per width; asserts focus lands on the next row's Forget.
  await state("S7-forget-focus", page(MALUTI), async (p, s) => {
    await toTable(p, s)
    const ids = await p.locator("[id^=forget-rule-]").evaluateAll((els) => els.map((e) => [e.id, e.getAttribute("aria-label")]))
    const i = ids.findIndex(([, label]) => /northside/.test(label))
    if (i < 0 || i === ids.length - 1) { s.probe("forget-next-focus", false, "no seeded northside row with a row after it — re-run seed-458"); return }
    await p.locator(`#${ids[i][0]}`).click()
    const dlg = p.getByRole("alertdialog")
    await s.visible(dlg)
    await dlg.getByRole("button", { name: "Forget", exact: true }).click()
    const closed = await s.hidden(dlg, 15000)
    const gone = await s.hidden(p.locator(`#${ids[i][0]}`), 15000)
    await p.waitForTimeout(800)
    const next = ids[i + 1][0]
    const f = await s.focusIs(new RegExp(`#${next}:`))
    s.probe("forget-next-focus", closed && gone && f.ok, `closed=${closed} gone=${gone} focus on ${f.focused}, expected #${next}`)
  })
})

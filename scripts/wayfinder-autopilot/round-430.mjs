// #430 build-gate round: Screen 3 rule-row reminder (Supplier accounts table) + Screen 2 Detail
// pane Account-only edit on a posted bill. Run from repo root after
// `node .impeccable/live/dev.mjs start af91555d-7450-4b21-a8ac-73db092617c8`, after
// scripts/dev/seed-account-correction.ts and scripts/dev/seed-account-correction-approve.ts have
// seeded the connection/rule/posted-bill, and after
// scripts/wayfinder-autopilot/tmp-retarget430.mjs has retargeted the rule to "fuel" so the posted
// bill (still on "sundry-expenses") shows up as a Screen 3 reminder.
import { round, roundArgs } from "./capture-round.mjs"

const WS = "af91555d-7450-4b21-a8ac-73db092617c8"
const POSTED_DOC = "570d8e7a-479b-41ee-9fe5-e10c9415d3d8"
const { out, only, widths } = roundArgs()

await round({ out, base: `http://localhost:3000/workspaces/${WS}`, only, ...(widths ? { widths } : {}) }, async ({ width, base, state, keyboard }) => {
  await state("01-supplier-reminder", `${base}/admin/integrations`, async (page, s) => {
    await page.waitForTimeout(500)
    const table = page.getByRole("table").filter({ hasText: "Usual account" })
    await s.visible(table, 8000)
    await table.scrollIntoViewIfNeeded()
    const reminder = page.getByText(/posted bills? still on/i).first()
    const reminderVisible = await s.visible(reminder, 5000)
    s.probe("reminder-line-visible", reminderVisible, "\"N posted bills still on … · Review\" line under the retargeted rule")
    await s.snap("", "Supplier accounts table with Screen 3 reminder row")
    if (reminderVisible) {
      const reviewBtn = page.getByRole("button", { name: /^review$/i }).first()
      if (await s.visible(reviewBtn, 3000)) {
        await reviewBtn.focus()
        keyboard("reminder-row-tab-walk", await s.tabWalk(4))
        await reviewBtn.click()
        const dialog = s.dialog()
        await s.visible(dialog, 5000)
        await s.snap("review-dialog", "Screen 1 dialog reopened from Screen 3's Review link")
        s.probe("review-dialog-title", await s.visible(dialog.getByText(/already posted/i), 3000), "dialog title names the old account")
      }
    }
  })

  await state("02-detail-pane-account-edit", `${base}/invoices/${POSTED_DOC}`, async (page, s) => {
    await page.waitForTimeout(2000)
    await s.snap("", "Detail pane on a posted bill — Account is the only editable line field")
    const select = page.locator("select[aria-label='Account']").first()
    const visible = await s.visible(select, 8000)
    s.probe("account-select-visible", visible, "editable Account select on a posted-bill line")
    if (visible) {
      s.probe("account-select-enabled", !(await select.isDisabled()), "Account select is NOT disabled on a posted bill (only field editable per spec Screen 2)")
      const amount = page.locator("input[aria-label='Amount'], input[name*='amount' i]").first()
      if (await s.visible(amount, 3000)) s.probe("amount-readonly", await amount.isDisabled(), "Amount stays read-only on a posted bill")
    }
  })
})

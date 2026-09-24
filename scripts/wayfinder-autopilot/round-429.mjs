// #429 build-gate round: Detail pane per-line Account (spec §A) + Accounting page Default row /
// Supplier accounts table (spec §B). Run from repo root after `node .impeccable/live/dev.mjs start
// af91555d-7450-4b21-a8ac-73db092617c8` and after scripts/wayfinder-autopilot/tmp-seed429.mjs has
// seeded a connection + accounts + supplier rules (dev-only fixtures, not part of prisma/seed.ts).
import { round, roundArgs } from "./capture-round.mjs"

const WS = "af91555d-7450-4b21-a8ac-73db092617c8"
const DOC = "684033b8-ae7c-449f-a53a-b0185c868609"
const { out, only, widths } = roundArgs()

await round({ out, base: `http://localhost:3000/workspaces/${WS}`, only, ...(widths ? { widths } : {}) }, async ({ width, base, state, keyboard }) => {
  // #429: the per-line Account cell only renders in the Invoices queue's embedded pane
  // (BillSplitPane, `embedded && queueTitle === "Invoices"` in documents/[documentId]/page.tsx) —
  // `?full=1` intentionally keeps the pre-#259 standalone shell with no Account cell. The route
  // that opens the queue with this document selected is /invoices/<id> (no ?full=1).
  await state("01-detail-pane-account", `${base}/invoices/${DOC}`, async (page, s) => {
    await page.waitForTimeout(2500)
    await s.snap("", "Invoices queue, pane open, per-line Account cell")
    const select = page.locator("select[aria-label='Account']").first()
    if (await s.visible(select, 8000)) {
      await select.scrollIntoViewIfNeeded()
      await s.snap("account-cell", "per-line Account select + provenance line")
      // #429: this select is intentionally `disabled` (see line-items-editor.tsx's LineAccountCell
      // comment) — a display-only field with no per-line override write path, not an interactive
      // control. Record that fact as a probe rather than attempting to focus/tab through it.
      s.probe("account-select-disabled", await select.isDisabled(), "Account select is read-only by design (no per-line override write path)")
    } else {
      s.probe("account-cell-visible", false, "no select[aria-label=Account] found on the line items table")
    }
  })

  await state("02-accounting-default", `${base}/admin/integrations`, async (page, s) => {
    await s.snap("", "Accounting page — Default row (Guessed badge)")
    const guessed = page.getByText("Guessed", { exact: true }).first()
    s.probe("guessed-badge-visible", await s.visible(guessed, 5000), "neutral Guessed badge on Default row")
  })

  await state("03-accounting-supplier-table", `${base}/admin/integrations`, async (page, s) => {
    await page.waitForTimeout(500)
    const table = page.getByRole("table").filter({ hasText: "Usual account" })
    await s.visible(table, 8000)
    await table.scrollIntoViewIfNeeded()
    await s.snap("", "Supplier accounts table — populated + archived row")
    const archivedRow = page.getByText(/was archived in/i).first()
    s.probe("archived-row-copy", await s.visible(archivedRow, 5000), "archived-account inline note")
    const firstForget = page.getByRole("button", { name: /forget/i }).first()
    if (await s.visible(firstForget, 3000)) {
      await firstForget.focus()
      keyboard("supplier-row-tab-walk", await s.tabWalk(6))
    }
    if (width === 1440) {
      const filter = page.getByPlaceholder(/filter/i).first()
      if (await s.visible(filter, 3000)) {
        await filter.fill("acme")
        await s.snap("filtered", "filter box narrows the supplier table")
        keyboard("supplier-table-filter", await s.tabWalk(6))
      } else {
        s.probe("filter-box-visible", false, "fewer than 20 rows — filter box not shown (expected, not a defect)")
      }
    }
  })

  await state("04-sync-accounts-load", `${base}/admin/integrations`, async (page, s) => {
    const loadBtn = page.getByRole("button", { name: /load accounts|sync accounts/i }).first()
    if (await s.visible(loadBtn, 5000)) {
      await loadBtn.click()
      await s.snap("loading", "\"Reading your chart of accounts…\" state (best-effort, may resolve before the screenshot)")
    } else {
      s.probe("load-accounts-button-visible", false, "no Load/Sync accounts button found")
    }
  })
})

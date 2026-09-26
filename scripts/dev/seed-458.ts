// #458 dev-only seed for the supplier table capture round (spec §6 States). Idempotent; re-run it
// before every round — the Forget → Confirm probe deletes one "northside" rule per width.
//   npx tsx --env-file .env scripts/dev/seed-458.ts
//
// Viewer = dev@docubite.local.
//   • Maluti Supplies (QBO, owner) → S1 mixed rows, S5 confirm, S6 error, S7 Forget → Confirm focus:
//     full row · account-only row · row with a stale (inactive) Class · row with a reminder · two
//     "northside" throwaway rows the Forget probe deletes (1440 then 390) · a last row after them.
//   • Harbor Lights Cafe (Xero, owner) → S2 two tracking categories (Region, Department).
//   • Pine Street Consulting (QBO connected, owner, no rules) → S3 empty.
//   • Northwind Traders (Xero, viewer is Member) → S4 non-owner.
import { prisma } from "@/lib/db"

const MALUTI = "af91555d-7450-4b21-a8ac-73db092617c8"
const HARBOR = "a74a45c2-aa1a-4f75-8fe5-80011962c57d"
const PINE = "60a2b427-9b0c-4a46-9390-ef7a91f6bd7d"
const NORTHWIND = "c5315ed3-053f-4dba-9821-ab1d085d405a"

type Entity = { type: string; id: string; name: string; code?: string; active?: boolean; parent?: [string, string]; pct?: number }

async function connection(workspaceId: string, provider: "quickbooks" | "xero", capabilities: object) {
  const existing = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider } })
  const data = { status: "connected", ledgerCapabilities: capabilities, ledgerCapabilitiesReadAt: new Date() }
  if (existing) return prisma.integrationConnection.update({ where: { id: existing.id }, data })
  return prisma.integrationConnection.create({ data: { workspaceId, provider, providerConfigKey: provider, externalTenantId: `seed458-${workspaceId.slice(0, 8)}`, tenantName: "Seed 458 books", ...data } })
}

async function entities(workspaceId: string, connectionId: string, rows: Entity[]) {
  for (const e of rows) {
    const data = {
      code: e.code ?? null, name: e.name, active: e.active ?? true, syncedAt: new Date(),
      parentExternalId: e.parent?.[0] ?? null, parentName: e.parent?.[1] ?? null, taxRatePercent: e.pct ?? null,
    }
    await prisma.accountingEntity.upsert({
      where: { connectionId_entityType_externalId: { connectionId, entityType: e.type, externalId: e.id } },
      update: data,
      create: { workspaceId, connectionId, entityType: e.type, externalId: e.id, ...data },
    })
  }
}

type Rule = { supplier: string; account: string; tax?: string; tracking?: { categoryId: string; optionId: string }[]; location?: string; days: number }

async function rules(workspaceId: string, connectionId: string, rows: Rule[]) {
  for (const r of rows) {
    const data = {
      accountExternalId: r.account, taxCodeExternalId: r.tax ?? null, tracking: r.tracking ?? [],
      locationExternalId: r.location ?? null, lastUsedAt: new Date(Date.now() - r.days * 86400000),
    }
    await prisma.supplierAccountRule.upsert({
      where: { connectionId_supplierName: { connectionId, supplierName: r.supplier } },
      update: data,
      create: { workspaceId, connectionId, supplierName: r.supplier, ...data },
    })
  }
}

const accounts: Entity[] = [
  { type: "account", id: "seed458-6100", code: "6100", name: "Cleaning" },
  { type: "account", id: "seed458-6200", code: "6200", name: "Electricity" },
  { type: "account", id: "seed458-6300", code: "6300", name: "Staff meals" },
  { type: "account", id: "seed458-6400", code: "6400", name: "Office supplies" },
  { type: "account", id: "seed458-6410", code: "6410", name: "Printing and stationery" },
  { type: "account", id: "seed458-6500", code: "6500", name: "Courier and postage" },
]

async function main() {
  // S1/S5/S6/S7 — QuickBooks, Class tracking + Location.
  const qbo = await connection(MALUTI, "quickbooks", { vat: true, tracking: [{ id: "class", name: "Class" }], location: true, customer: true, billable: true })
  await entities(MALUTI, qbo.id, [
    ...accounts,
    { type: "tax_rate", id: "seed458-std", name: "Standard", pct: 15 },
    { type: "tax_rate", id: "seed458-zero", name: "Zero-rated 0%", pct: 0 },
    { type: "tracking_option", id: "seed458-ops", name: "Operations", parent: ["class", "Class"] },
    { type: "tracking_option", id: "seed458-events", name: "Events 2025", parent: ["class", "Class"], active: false },
    { type: "location", id: "seed458-maseru", name: "Maseru branch" },
  ])
  await rules(MALUTI, qbo.id, [
    { supplier: "blue harbour cleaning", account: "seed458-6100", tax: "seed458-std", tracking: [{ categoryId: "class", optionId: "seed458-ops" }], location: "seed458-maseru", days: 2 },
    { supplier: "city power", account: "seed458-6200", days: 9 },
    { supplier: "greenleaf catering", account: "seed458-6300", tax: "seed458-zero", tracking: [{ categoryId: "class", optionId: "seed458-events" }], days: 21 },
    { supplier: "metro stationers", account: "seed458-6410", tax: "seed458-std", days: 5 },
    { supplier: "northside couriers", account: "seed458-6500", tax: "seed458-std", days: 12 },
    { supplier: "northside print", account: "seed458-6410", tax: "seed458-std", location: "seed458-maseru", days: 14 },
    { supplier: "office hub", account: "seed458-6400", tax: "seed458-std", tracking: [{ categoryId: "class", optionId: "seed458-ops" }], days: 30 },
  ])
  // The reminder: a paid bill from Metro Stationers still coded to 6400, the rule now says 6410.
  let file = await prisma.documentFile.findFirst({ where: { workspaceId: MALUTI, name: "seed-458" } })
  if (!file) file = await prisma.documentFile.create({ data: { workspaceId: MALUTI, name: "seed-458" } })
  if (!(await prisma.document.count({ where: { workspaceId: MALUTI, fileId: file.id } }))) {
    await prisma.document.create({
      data: {
        workspaceId: MALUTI, fileId: file.id, source: "upload", status: "reviewed", paymentStatus: "paid",
        filename: "metro-stationers-0917.pdf", mimeType: "application/pdf", sizeBytes: 1024, sha256: "seed458-metro-1", fieldSnapshot: [],
        reviewedData: { vendor: "Metro Stationers" }, codingData: { items: [{ account_external_id: "seed458-6400" }] },
      },
    })
  }

  // S2 — Xero, two tracking categories.
  const xero = await connection(HARBOR, "xero", { vat: true, tracking: [{ id: "seed458-region", name: "Region" }, { id: "seed458-dept", name: "Department" }], location: false, customer: false, billable: false })
  await entities(HARBOR, xero.id, [
    ...accounts,
    { type: "tax_rate", id: "INPUT", name: "Standard Rate Purchases", pct: 15 },
    { type: "tracking_option", id: "seed458-north", name: "North", parent: ["seed458-region", "Region"] },
    { type: "tracking_option", id: "seed458-kitchen", name: "Kitchen", parent: ["seed458-dept", "Department"] },
    { type: "tracking_option", id: "seed458-front", name: "Front of house", parent: ["seed458-dept", "Department"] },
  ])
  await rules(HARBOR, xero.id, [
    { supplier: "blue harbour cleaning", account: "seed458-6100", tax: "INPUT", tracking: [{ categoryId: "seed458-region", optionId: "seed458-north" }, { categoryId: "seed458-dept", optionId: "seed458-front" }], days: 3 },
    { supplier: "fresh farm produce", account: "seed458-6300", tax: "INPUT", tracking: [{ categoryId: "seed458-region", optionId: "seed458-north" }, { categoryId: "seed458-dept", optionId: "seed458-kitchen" }], days: 1 },
    { supplier: "city power", account: "seed458-6200", tax: "INPUT", days: 10 },
  ])

  // S3 — connected, no rules.
  const pine = await connection(PINE, "quickbooks", { vat: true, tracking: [{ id: "class", name: "Class" }], location: false, customer: true, billable: true })
  await prisma.supplierAccountRule.deleteMany({ where: { workspaceId: PINE, connectionId: pine.id } })

  // S4 — Member viewer.
  const nw = await connection(NORTHWIND, "xero", { vat: true, tracking: [{ id: "seed458-region", name: "Region" }], location: false, customer: false, billable: false })
  await entities(NORTHWIND, nw.id, [
    ...accounts,
    { type: "tax_rate", id: "INPUT", name: "Standard Rate Purchases", pct: 15 },
    { type: "tracking_option", id: "seed458-north", name: "North", parent: ["seed458-region", "Region"] },
  ])
  await rules(NORTHWIND, nw.id, [
    { supplier: "blue harbour cleaning", account: "seed458-6100", tax: "INPUT", tracking: [{ categoryId: "seed458-region", optionId: "seed458-north" }], days: 4 },
    { supplier: "city power", account: "seed458-6200", days: 8 },
  ])
  console.log("seed-458: Maluti QBO (7 rules + reminder doc), Harbor Xero (3 rules, 2 categories), Pine QBO (empty), Northwind Xero (Member, 2 rules)")
}
main().finally(() => prisma.$disconnect())

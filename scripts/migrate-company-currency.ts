import { mkdirSync, writeFileSync } from "node:fs"
import { migrateCompanyCurrencies } from "@/models/company-currency-migration"

/** ADR 0013 cutover: `npx tsx scripts/migrate-company-currency.ts [--dry-run]`. Safe to re-run —
 * migrated companies are skipped and only still-pending Owner notices are sent. Locked companies
 * are never touched; they are printed and written to logs/company-currency-support-list.json. */
async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const result = await migrateCompanyCurrencies({ dryRun })
  for (const m of result.migrated) console.log(`${dryRun ? "would migrate" : "migrated"} ${m.name}: ${m.from} → ${m.to}${m.count === null ? "" : ` (${m.count} documents re-converted)`}`)
  for (const s of result.supportList) console.log(`support list: ${s.name} ${s.country}/${s.baseCurrency} — locked by ${s.cause}${s.provider ? ` (${s.provider})` : ""} on ${s.at.toISOString().slice(0, 10)}`)
  mkdirSync("logs", { recursive: true })
  writeFileSync("logs/company-currency-support-list.json", JSON.stringify(result.supportList, null, 2))
  console.log(`migrate-company-currency: ${result.migrated.length} migrated, ${result.supportList.length} on the support list, ${result.noticesSent} Owner notices sent${dryRun ? " (dry run)" : ""}`)
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })

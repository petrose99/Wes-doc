// #430 step-6 verification helper: retargets the seeded "Acme Fuel Co" rule to "fuel" directly
// (what approving seed-account-correction-approve.ts's pending task would do via
// learnSupplierAccountRuleFromApproval, already exercised by #429's own tests) so the posted bill
// seed-account-correction.ts left on "sundry-expenses" now mismatches the rule — the exact Screen 3
// condition — without spending a browser round-trip on the approval flow itself.
//   npx tsx --env-file .env scripts/wayfinder-autopilot/tmp-retarget430.mjs <workspaceId>
import { prisma } from "@/lib/db"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"

const workspaceId = process.argv[2]
if (!workspaceId) throw new Error("usage: tmp-retarget430.mjs <workspaceId>")

const supplierName = normalizeSupplierName("Acme Fuel Co")
const rule = await prisma.supplierAccountRule.updateMany({
  where: { workspaceId, supplierName },
  data: { accountExternalId: "fuel", lastUsedAt: new Date() },
})
console.log(JSON.stringify({ supplierName, ...rule }))
await prisma.$disconnect()

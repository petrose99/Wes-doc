import { prisma } from "@/lib/db";
const ws = "af91555d-7450-4b21-a8ac-73db092617c8";
const conn = await prisma.integrationConnection.findMany({ where: { workspaceId: ws } });
const acct = await prisma.accountingEntity.findMany({ where: { workspaceId: ws } });
const rules = await prisma.supplierAccountRule.findMany({ where: { workspaceId: ws } });
console.log("connections", conn.length, conn.map((c: any) => c.provider));
console.log("accounts", acct.length, acct.map((a: any) => `${a.name}(${a.isActive})`));
console.log("rules", rules.length, rules.map((r: any) => JSON.stringify(r)));
await prisma.$disconnect();

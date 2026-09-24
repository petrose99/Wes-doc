import { prisma } from "@/lib/db";
const doc = await prisma.document.findUnique({ where: { id: "684033b8-ae7c-449f-a53a-b0185c868609" } });
const coding = doc?.codingData as any;
console.log("status", doc?.status, "type", coding?.documentType, "docType", doc?.docType);
console.log("keys", Object.keys(coding ?? {}));
console.log("vendorName", coding?.vendorName, "vendor", coding?.vendor, "supplier", coding?.supplier);
console.log("lineItems length", Array.isArray(coding?.lineItems) ? coding.lineItems.length : coding?.lineItems);
await prisma.$disconnect();

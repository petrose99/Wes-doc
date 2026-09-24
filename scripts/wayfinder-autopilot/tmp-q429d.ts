import { prisma } from "@/lib/db";
const doc = await prisma.document.findUnique({ where: { id: "684033b8-ae7c-449f-a53a-b0185c868609" } });
const data = (doc?.reviewedData ?? doc?.rawExtraction ?? {}) as any;
console.log("vendor", data.vendor, "merchant", data.merchant);
console.log("line_items length", Array.isArray(data.line_items) ? data.line_items.length : data.line_items);
await prisma.$disconnect();

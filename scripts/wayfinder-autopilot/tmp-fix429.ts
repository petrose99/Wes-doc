import { prisma } from "@/lib/db";
import { resolveDocumentCodingItems } from "@/models/documents";

const DOC = "684033b8-ae7c-449f-a53a-b0185c868609";
const doc = await prisma.document.findUniqueOrThrow({ where: { id: DOC } });
const coding = (doc.codingData as any) ?? {};
const data = (doc.reviewedData ?? doc.rawExtraction ?? {}) as any;
const lineCount = Array.isArray(data.line_items) ? data.line_items.length : 1;
const vendorName = typeof data.vendor === "string" ? data.vendor : null;

const rows = await resolveDocumentCodingItems({
  workspaceId: doc.workspaceId,
  vendorName,
  category: coding.category ?? null,
  codingSource: "manual",
  codedAt: new Date(),
  lineCount,
});
console.log("resolved rows:", JSON.stringify(rows, null, 2));

if (rows) {
  const newCoding = { ...coding, items: rows };
  await prisma.document.update({ where: { id: DOC }, data: { codingData: newCoding } });
  console.log("updated codingData.items on", DOC);
} else {
  console.log("resolveDocumentCodingItems returned null — check connection/config");
}
await prisma.$disconnect();

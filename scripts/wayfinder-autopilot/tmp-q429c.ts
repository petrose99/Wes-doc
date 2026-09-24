import { prisma } from "@/lib/db";
const ws = "af91555d-7450-4b21-a8ac-73db092617c8";
const docs = await prisma.document.findMany({
  where: { workspaceId: ws, docType: "invoice", status: { in: ["ready_for_review", "needs_review"] } },
  select: { id: true, status: true, docType: true, codingData: true },
  take: 10,
});
for (const d of docs) {
  const coding = d.codingData as any;
  console.log(d.id, d.status, "items:", Array.isArray(coding?.items) ? coding.items.length : coding?.items);
}
await prisma.$disconnect();

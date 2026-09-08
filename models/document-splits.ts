import { prisma } from "@/lib/db"
import { createHash, randomUUID } from "crypto"

export type SplitProposal = {
  parentDocumentId: string
  segments: { startPage: number; endPage: number; confidence: number; reason: string }[]
}

export type ChildDocumentInput = {
  parentDocumentId: string
  pageRange: string
  filename: string
  docType?: string | null
}

function childSha256(parentSha256: string, pageRange: string): string {
  return createHash("sha256").update(`${parentSha256}:${pageRange}`).digest("hex")
}

export async function createChildDocuments(
  workspaceId: string,
  fileId: string,
  parentDocumentId: string,
  children: ChildDocumentInput[],
): Promise<string[]> {
  const parent = await prisma.document.findUniqueOrThrow({
    where: { id: parentDocumentId },
    select: {
      source: true,
      mimeType: true,
      sizeBytes: true,
      sha256: true,
      storageKey: true,
      templateId: true,
      templateVersionId: true,
      uploadBatchId: true,
      receivedAt: true,
    },
  })

  const ids: string[] = []
  await prisma.$transaction(async (tx) => {
    for (const child of children) {
      const id = randomUUID()
      await tx.document.create({
        data: {
          id,
          workspaceId,
          fileId,
          source: parent.source,
          status: "received",
          filename: child.filename,
          mimeType: parent.mimeType,
          sizeBytes: parent.sizeBytes,
          sha256: childSha256(parent.sha256, child.pageRange),
          storageKey: parent.storageKey,
          templateId: parent.templateId,
          templateVersionId: parent.templateVersionId,
          pageRange: child.pageRange,
          parentDocumentId: child.parentDocumentId,
          docType: child.docType ?? null,
          uploadBatchId: parent.uploadBatchId,
          receivedAt: parent.receivedAt,
          fieldSnapshot: {},
        },
      })
      await tx.documentProcessingJob.create({
        data: { workspaceId, documentId: id, type: "extract" },
      })
      ids.push(id)
    }

    await tx.document.update({
      where: { id: parentDocumentId },
      data: { splitStatus: "split", status: "split" },
    })
    await tx.documentProcessingJob.updateMany({
      where: { documentId: parentDocumentId, status: "processing" },
      data: { status: "completed", completedAt: new Date(), leaseUntil: null },
    })
  })

  return ids
}

export async function listChildDocuments(workspaceId: string, parentDocumentId: string): Promise<{ id: string; filename: string; pageRange: string | null; status: string }[]> {
  return await prisma.document.findMany({
    where: { workspaceId, parentDocumentId },
    select: { id: true, filename: true, pageRange: true, status: true },
    orderBy: { receivedAt: "asc" },
  })
}

export async function markSplitStatus(documentId: string, status: "pending" | "split" | "rejected"): Promise<void> {
  await prisma.document.update({
    where: { id: documentId },
    data: { splitStatus: status },
  })
}

export async function undoSplit(parentDocumentId: string, workspaceId: string): Promise<void> {
  const children = await prisma.document.findMany({
    where: { parentDocumentId, workspaceId },
    select: { id: true, storageKey: true },
  })

  await prisma.$transaction(async (tx) => {
    for (const child of children) {
      await tx.documentProcessingJob.deleteMany({ where: { documentId: child.id } })
      await tx.documentAuditEvent.deleteMany({ where: { documentId: child.id } })
      await tx.document.delete({ where: { id: child.id } })
    }
    await tx.document.update({
      where: { id: parentDocumentId },
      data: { splitStatus: null, status: "received" },
    })
    await tx.documentProcessingJob.create({
      data: { workspaceId, documentId: parentDocumentId, type: "extract" },
    })
  })
}

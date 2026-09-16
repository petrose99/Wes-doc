import { prisma } from "@/lib/db"
import { cache } from "react"

const MAX_CORRECTIONS_PER_KEY = 20

export async function recordCodingCorrection(input: {
  workspaceId: string
  templateCode: string
  codingKey: string
  supplier: string | null
  wrongValue: string
  correctedValue: string
}): Promise<void> {
  try {
    await prisma.codingCorrection.upsert({
      where: { workspaceId_templateCode_codingKey_wrongValue_correctedValue: { workspaceId: input.workspaceId, templateCode: input.templateCode, codingKey: input.codingKey, wrongValue: input.wrongValue, correctedValue: input.correctedValue } },
      create: { workspaceId: input.workspaceId, templateCode: input.templateCode, codingKey: input.codingKey, supplier: input.supplier, wrongValue: input.wrongValue, correctedValue: input.correctedValue },
      update: { hitCount: { increment: 1 }, supplier: input.supplier ?? undefined },
    })

    const rows = await prisma.codingCorrection.findMany({
      where: { workspaceId: input.workspaceId, templateCode: input.templateCode, codingKey: input.codingKey },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })
    const excess = rows.slice(MAX_CORRECTIONS_PER_KEY)
    if (excess.length) await prisma.codingCorrection.deleteMany({ where: { workspaceId: input.workspaceId, id: { in: excess.map((row) => row.id) } } })
  } catch (error) {
    console.error("[coding-corrections] failed to record correction:", error instanceof Error ? error.message : error)
  }
}

export type CodingCorrectionExample = { codingKey: string; wrongValue: string; correctedValue: string }

export const getCodingCorrectionExamples = cache(async (workspaceId: string, templateCode: string, limit = 8): Promise<CodingCorrectionExample[]> => {
  const rows = await prisma.codingCorrection.findMany({
    where: { workspaceId, templateCode },
    orderBy: [{ hitCount: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: { codingKey: true, wrongValue: true, correctedValue: true },
  })
  return rows.map((row) => ({ codingKey: row.codingKey, wrongValue: truncate(row.wrongValue), correctedValue: truncate(row.correctedValue) }))
})

function truncate(value: string): string {
  return value.length > 200 ? `${value.slice(0, 200)}…` : value
}

#!/usr/bin/env tsx
/** A8.4 bge-m3 re-embed one-off. Bge-m3 is 1024-dim (bge-base and nomic-embed-text-v1 are
 * 768-dim), so a switch means: (a) alter the embedding column to vector(1024), (b) clear
 * every chunk hash so the embed job re-runs against every document, (c) let the worker do the
 * actual re-embed on its own schedule. This runs (a) and (b) only; the worker loop is what
 * fills the new dimension.
 *
 * Only run when EMBEDDINGS_MODEL_NAME is being flipped to a 1024-dim model. Idempotent:
 * dropping the column when it already IS 1024-dim is a no-op via `IF EXISTS`. */
import { prisma } from "@/lib/db"

async function main() {
  const targetDim = Number(process.env.TARGET_EMBEDDING_DIM ?? "1024")
  if (!Number.isFinite(targetDim) || targetDim < 128) throw new Error("TARGET_EMBEDDING_DIM missing or invalid")
  console.log(`[reembed] altering document_chunks.embedding to vector(${targetDim})…`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "document_chunks" DROP COLUMN IF EXISTS "embedding"`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "document_chunks" ADD COLUMN "embedding" vector(${targetDim})`)
  // Old ivfflat/hnsw index (if any) is dropped by DROP COLUMN CASCADE — recreate the HNSW.
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "document_chunks_embedding_hnsw_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops)`)
  console.log("[reembed] clearing chunk hashes so the embed job re-runs every document…")
  const cleared = await prisma.documentChunk.updateMany({ where: {}, data: { contentHash: "" } })
  console.log(`[reembed] ${cleared.count} chunks marked for re-embed`)
  await prisma.$disconnect()
}

main().catch((error) => { console.error(error); process.exit(1) })

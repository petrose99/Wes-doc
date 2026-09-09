import config from "@/lib/config"
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import fs from "fs/promises"
import path from "path"

const localRoot = path.resolve(process.env.DOCUMENT_SOURCE_PATH || "./data/document-sources")

/** Storage is S3 when a bucket is named, and the local volume otherwise — that fallback is what a
 * dev machine and a single-box install run on.
 *
 * S3_ENDPOINT points the same client at an S3-compatible service that is not AWS (Cloudflare R2).
 * Two things change when it is set. Requests go path-style, because a bucket in a vendor's domain
 * is not addressable as a subdomain the way an AWS bucket is. And SSE-KMS is dropped: KMS is an
 * AWS service, R2 rejects the header, and R2 encrypts every object at rest regardless — so asking
 * for encryption is both impossible and unnecessary there. On real S3 the header still goes,
 * because there the encryption is opt-in and dropping it would silently downgrade every upload. */
const usingCustomEndpoint = Boolean(config.aws.endpoint)
const client = new S3Client({
  region: config.aws.region,
  ...(usingCustomEndpoint ? { endpoint: config.aws.endpoint, forcePathStyle: true } : {}),
})
const s3 = config.aws.documentsBucket ? client : null

function localPathForKey(key: string) {
  const resolved = path.resolve(localRoot, key)
  if (!resolved.startsWith(localRoot + path.sep)) throw new Error("Invalid document storage key")
  return resolved
}

export function documentStorageKey(workspaceId: string, documentId: string) {
  return `workspaces/${workspaceId}/documents/${documentId}/source`
}

/** Sidecar holding the document's parsed blocks and page sizes, next to the source under the same
 * document prefix. Provenance the row already carries is enough to draw a highlight; this exists
 * so a value's source can be re-resolved later without re-parsing the document. */
export function documentBlocksKey(workspaceId: string, documentId: string) {
  return `workspaces/${workspaceId}/documents/${documentId}/blocks`
}

/** Reads the blocks sidecar, or null when it was never written (older documents, or a best-effort
 * write that failed). Never throws for a missing sidecar — its absence is expected. */
export async function readDocumentBlocks(key: string): Promise<string | null> {
  try {
    return (await readDocumentSource(key)).toString("utf8")
  } catch {
    return null
  }
}

export async function putDocumentSource(key: string, body: Buffer, contentType: string) {
  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: config.aws.documentsBucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(usingCustomEndpoint
          ? {}
          : {
              ServerSideEncryption: "aws:kms" as const,
              ...(config.aws.kmsKeyId ? { SSEKMSKeyId: config.aws.kmsKeyId } : {}),
            }),
      })
    )
    return
  }

  const target = localPathForKey(key)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, body, { mode: 0o600 })
}

export async function readDocumentSource(key: string): Promise<Buffer> {
  if (s3) {
    const result = await s3.send(new GetObjectCommand({ Bucket: config.aws.documentsBucket, Key: key }))
    if (!result.Body) throw new Error("Document source is missing")
    return Buffer.from(await result.Body.transformToByteArray())
  }
  return fs.readFile(localPathForKey(key))
}

export async function deleteDocumentSource(key: string) {
  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: config.aws.documentsBucket, Key: key }))
    return
  }
  await fs.rm(localPathForKey(key), { force: true })
}

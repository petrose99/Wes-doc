import { apiError, parseLimit, requireApiAuth } from "@/lib/api-v1"
import { buildApiDocumentListItem } from "@/lib/webhooks"
import { DOCUMENT_STATUSES, PIPELINE_STAGES, parseStageAlias } from "@/lib/documents/stages"
import { createIngestionItem } from "@/lib/ingestion"
import { processDocumentJob } from "@/lib/document-processing"
import { getFileTemplates, getWorkspaceFile } from "@/models/files"
import { listDocumentsForApi } from "@/models/integrations"
import { after } from "next/server"

/** GET /api/v1/documents — the Zapier polling trigger. Cursor-paginated, newest first.
 * Query: ?status=&stage=&updated_since=<ISO>&cursor=<id>&limit=<1..100>.
 *
 * `status` is the original filter, unchanged: an exact match on the raw persisted value (see
 * lib/documents/stages.ts — DOCUMENT_STATUSES is exactly the set that has ever actually been
 * written to Document.status). `stage` is additive: the pipeline's Inbox/To review/Ready/
 * Approvals/Archive vocabulary, for a caller that would rather not track individual statuses. */
export async function GET(req: Request) {
  const auth = await requireApiAuth(req)
  if (auth instanceof Response) return auth

  const url = new URL(req.url)
  const updatedSinceRaw = url.searchParams.get("updated_since")
  let updatedSince: Date | undefined
  if (updatedSinceRaw) {
    const parsed = new Date(updatedSinceRaw)
    if (Number.isNaN(parsed.getTime())) return apiError(400, "invalid_updated_since")
    updatedSince = parsed
  }

  const statusRaw = url.searchParams.get("status")
  if (statusRaw && !(DOCUMENT_STATUSES as readonly string[]).includes(statusRaw)) return apiError(400, "invalid_status")
  const stageRaw = url.searchParams.get("stage")
  // Legacy aliases (to_review, ready) stay honored indefinitely — Zapier and webhook consumers
  // are still writing against those names, and parseStageAlias maps them onto the canonical stage.
  const stage = parseStageAlias(stageRaw)
  if (stageRaw && !stage) return apiError(400, "invalid_stage")

  const { documents, nextCursor } = await listDocumentsForApi(auth.workspaceId, {
    status: statusRaw ?? undefined,
    stage: stage ?? undefined,
    updatedSince,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: parseLimit(url.searchParams.get("limit"), 50, 100),
  })

  return Response.json({ data: documents.map(buildApiDocumentListItem), next_cursor: nextCursor })
}

/** POST /api/v1/documents — programmatic ingestion. Multipart form:
 *   - file (required): the document bytes
 *   - file_id (required): the destination sheet (DocumentFile) id in this workspace
 *   - template_code (optional): the DocumentTemplate.code to extract against — defaults to
 *     the sheet's "generic" template
 *
 * Routes through createIngestionItem with source="api" so it flows through the same malware
 * scan, workspace-wide idempotency, and Document/DocumentProcessingJob creation as an upload.
 * Returns 202 with the created Document + ingestion outcome. */
export async function POST(req: Request) {
  const auth = await requireApiAuth(req)
  if (auth instanceof Response) return auth

  const contentType = req.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("multipart/form-data")) return apiError(415, "unsupported_media_type")

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return apiError(400, "invalid_multipart")
  }

  const file = form.get("file")
  if (!(file instanceof File) || file.size === 0) return apiError(400, "missing_file")
  const fileId = String(form.get("file_id") ?? "").trim()
  if (!fileId) return apiError(400, "missing_file_id")

  const destination = await getWorkspaceFile(auth.workspaceId, fileId)
  if (!destination) return apiError(404, "file_not_found")

  const templates = await getFileTemplates(auth.workspaceId, fileId)
  const templateCodeRaw = String(form.get("template_code") ?? "").trim()
  const template = templateCodeRaw
    ? templates.find((t) => t.code === templateCodeRaw)
    : templates.find((t) => t.code === "generic") ?? templates[0]
  if (!template) return apiError(400, templateCodeRaw ? "unknown_template" : "no_template_available")

  const buffer = Buffer.from(await file.arrayBuffer())
  const outcome = await createIngestionItem({
    workspaceId: auth.workspaceId,
    fileId,
    templateId: template.id,
    source: "api",
    filename: file.name || "upload",
    mimeType: file.type || "application/octet-stream",
    buffer,
  })

  if (outcome.outcome === "rejected") return apiError(422, outcome.errorCode)
  if (outcome.outcome === "duplicate") {
    return Response.json({
      status: "duplicate",
      ingestion_id: outcome.item.id,
      document_id: outcome.item.documentId ?? null,
    }, { status: 200 })
  }

  // Best-effort in-process kick so extraction runs even without the worker; the job's atomic
  // claim makes this safe when the worker is running too (same pattern as uploadDocumentsAction).
  const jobId = outcome.duplicateInFile ? null : outcome.job?.id
  if (jobId) after(() => processDocumentJob(jobId).catch(() => {}))

  return Response.json({
    status: outcome.duplicateInFile ? "duplicate" : "accepted",
    ingestion_id: outcome.item.id,
    document_id: outcome.document.id,
    filename: outcome.document.filename,
  }, { status: 202 })
}

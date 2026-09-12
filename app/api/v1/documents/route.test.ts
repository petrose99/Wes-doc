import { beforeEach, describe, expect, it, vi } from "vitest"

const { integrations } = vi.hoisted(() => ({ integrations: { enabled: true } }))
vi.mock("@/lib/config", () => ({ default: { get integrations() { return integrations }, app: { baseURL: "https://app.test" } } }))
vi.mock("@/lib/api-auth", () => ({ authenticateApiRequest: vi.fn() }))
vi.mock("@/lib/ingestion", () => ({ createIngestionItem: vi.fn() }))
// #49: route imports JurisdictionRequiredError from lib/jurisdictions/require, which pulls in
// @/lib/db (unmocked here). Stub the module.
class MockJurisdictionRequiredError extends Error {
  readonly code = "JURISDICTION_REQUIRED"
  constructor(readonly workspaceId: string) { super("jurisdiction_required"); this.name = "JurisdictionRequiredError" }
}
vi.mock("@/lib/jurisdictions/require", () => ({ JurisdictionRequiredError: MockJurisdictionRequiredError }))
vi.mock("@/models/files", () => ({ getWorkspaceFile: vi.fn(), getFileTemplates: vi.fn() }))
vi.mock("@/models/integrations", () => ({ listDocumentsForApi: vi.fn() }))
vi.mock("@/lib/document-processing", () => ({ processDocumentJob: vi.fn().mockResolvedValue(undefined) }))
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }))

const { POST } = await import("@/app/api/v1/documents/route")
const { authenticateApiRequest } = await import("@/lib/api-auth")
const { createIngestionItem } = await import("@/lib/ingestion")
const { getWorkspaceFile, getFileTemplates } = await import("@/models/files")

function multipart(fields: Record<string, string | Blob>): Request {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return new Request("https://app.test/api/v1/documents", {
    method: "POST",
    headers: { authorization: "Bearer test-key" },
    body: form,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  integrations.enabled = true
  vi.mocked(authenticateApiRequest).mockResolvedValue({ ok: true, workspaceId: "w1", apiKeyId: "k1" } as never)
})

describe("POST /api/v1/documents", () => {
  it("refuses when the deployment has integrations disabled", async () => {
    integrations.enabled = false
    const res = await POST(multipart({ file: new Blob(["hi"]) }))
    expect(res.status).toBe(404)
  })

  it("refuses a request with no bearer / bad key (auth returns 401)", async () => {
    vi.mocked(authenticateApiRequest).mockResolvedValue({ ok: false, status: 401, errorCode: "unauthorized" } as never)
    const res = await POST(multipart({ file: new Blob(["hi"]) }))
    expect(res.status).toBe(401)
  })

  it("refuses a non-multipart body", async () => {
    const res = await POST(new Request("https://app.test/api/v1/documents", { method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" }, body: "{}" }))
    expect(res.status).toBe(415)
  })

  it("refuses when the file field is missing", async () => {
    const res = await POST(multipart({ file_id: "f1" }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: "missing_file" } })
  })

  it("refuses when the file_id field is missing", async () => {
    const res = await POST(multipart({ file: new File([Buffer.from("hi")], "x.pdf", { type: "application/pdf" }) }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: "missing_file_id" } })
  })

  it("refuses when the target sheet does not belong to the caller's workspace", async () => {
    vi.mocked(getWorkspaceFile).mockResolvedValue(null as never)
    const res = await POST(multipart({ file: new File([Buffer.from("hi")], "x.pdf"), file_id: "f1" }))
    expect(res.status).toBe(404)
  })

  it("refuses when template_code was given but not found on the sheet", async () => {
    vi.mocked(getWorkspaceFile).mockResolvedValue({ id: "f1" } as never)
    vi.mocked(getFileTemplates).mockResolvedValue([{ id: "t1", code: "generic" }] as never)
    const res = await POST(multipart({ file: new File([Buffer.from("hi")], "x.pdf"), file_id: "f1", template_code: "invoice" }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: "unknown_template" } })
  })

  it("returns 202 with the created document on a happy-path accepted ingestion", async () => {
    vi.mocked(getWorkspaceFile).mockResolvedValue({ id: "f1" } as never)
    vi.mocked(getFileTemplates).mockResolvedValue([{ id: "t1", code: "generic" }] as never)
    vi.mocked(createIngestionItem).mockResolvedValue({
      outcome: "accepted",
      item: { id: "i1" },
      document: { id: "d1", filename: "x.pdf" },
      job: { id: "j1" },
      duplicateInFile: false,
    } as never)
    const res = await POST(multipart({ file: new File([Buffer.from("hi")], "x.pdf", { type: "application/pdf" }), file_id: "f1" }))
    expect(res.status).toBe(202)
    expect(await res.json()).toMatchObject({ status: "accepted", document_id: "d1", ingestion_id: "i1" })
    expect(createIngestionItem).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "w1", source: "api" }))
  })

  it("returns 200 duplicate on an idempotent re-post of the same bytes", async () => {
    vi.mocked(getWorkspaceFile).mockResolvedValue({ id: "f1" } as never)
    vi.mocked(getFileTemplates).mockResolvedValue([{ id: "t1", code: "generic" }] as never)
    vi.mocked(createIngestionItem).mockResolvedValue({
      outcome: "duplicate",
      item: { id: "i1", documentId: "d1" },
    } as never)
    const res = await POST(multipart({ file: new File([Buffer.from("hi")], "x.pdf"), file_id: "f1" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: "duplicate", document_id: "d1" })
  })

  it("returns 422 with the ingestion error code when the file is rejected", async () => {
    vi.mocked(getWorkspaceFile).mockResolvedValue({ id: "f1" } as never)
    vi.mocked(getFileTemplates).mockResolvedValue([{ id: "t1", code: "generic" }] as never)
    vi.mocked(createIngestionItem).mockResolvedValue({
      outcome: "rejected",
      item: { id: "i1" },
      errorCode: "malware_detected",
    } as never)
    const res = await POST(multipart({ file: new File([Buffer.from("bad")], "x.pdf"), file_id: "f1" }))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: { code: "malware_detected" } })
  })

  // #49: refuses programmatic ingestion when the workspace has picked no jurisdiction. Matches the
  // email-in route (409 jurisdiction_required) so callers on either channel see one code path.
  it("returns 409 jurisdiction_required when the workspace has no jurisdictionCode", async () => {
    vi.mocked(getWorkspaceFile).mockResolvedValue({ id: "f1" } as never)
    vi.mocked(getFileTemplates).mockResolvedValue([{ id: "t1", code: "generic" }] as never)
    vi.mocked(createIngestionItem).mockRejectedValueOnce(new MockJurisdictionRequiredError("w1"))

    const res = await POST(multipart({ file: new File([Buffer.from("hi")], "x.pdf"), file_id: "f1" }))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: "jurisdiction_required" } })
  })
})

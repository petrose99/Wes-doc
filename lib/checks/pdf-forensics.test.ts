import { describe, expect, it } from "vitest"
import { checkPdfForensics, normalizePdfDate, readPdfForensicSignals } from "@/lib/checks/pdf-forensics"

const pdf = (parts: string) => Buffer.from(`%PDF-1.4\n${parts}\n%%EOF\n`, "latin1")

describe("normalizePdfDate", () => {
  it("parses a full timestamp", () => {
    expect(normalizePdfDate("D:20260906123045+02'00'")).toBe("2026-09-06T12:30:45")
  })
  it("handles date-only", () => expect(normalizePdfDate("D:20260906")).toBe("2026-09-06"))
  it("returns empty on garbage", () => expect(normalizePdfDate("nonsense")).toBe(""))
})

describe("readPdfForensicSignals", () => {
  it("pulls DocInfo and XMP fields out of a raw PDF", () => {
    const raw = pdf(
      "/ModDate (D:20260906120000) /Producer (Ghostscript)\n" +
      "<xmp:ModifyDate>2026-09-06T12:00:00</xmp:ModifyDate><xmp:CreatorTool>Microsoft Word</xmp:CreatorTool>",
    )
    expect(readPdfForensicSignals(raw)).toEqual({
      docInfoModDate: "D:20260906120000",
      docInfoProducer: "Ghostscript",
      xmpModifyDate: "2026-09-06T12:00:00",
      xmpCreatorTool: "Microsoft Word",
    })
  })
})

describe("checkPdfForensics", () => {
  it("passes silently when signals agree", () => {
    const result = checkPdfForensics({
      docInfoModDate: "D:20260906120000", docInfoProducer: "Ghostscript",
      xmpModifyDate: "2026-09-06T12:00:00", xmpCreatorTool: "Ghostscript",
    })
    expect(result).toBeNull()
  })

  it("warns when DocInfo/ModDate and XMP/ModifyDate disagree", () => {
    const result = checkPdfForensics({
      docInfoModDate: "D:20260906120000", docInfoProducer: null,
      xmpModifyDate: "2026-09-07T09:00:00", xmpCreatorTool: null,
    })
    expect(result).toMatchObject({ status: "warn", checkCode: "pdf_forensics" })
    expect(result?.message).toContain("ModifyDate")
  })

  it("warns when a known editor appears in the producer chain alongside a different creator", () => {
    const result = checkPdfForensics({
      docInfoModDate: null, docInfoProducer: "Adobe Acrobat Pro 24.1",
      xmpModifyDate: null, xmpCreatorTool: "Microsoft Word",
    })
    expect(result?.status).toBe("warn")
  })

  it("is silent when only one side has data (inconclusive)", () => {
    expect(checkPdfForensics({ docInfoModDate: "D:20260906120000", docInfoProducer: null, xmpModifyDate: null, xmpCreatorTool: null })).toBeNull()
  })
})

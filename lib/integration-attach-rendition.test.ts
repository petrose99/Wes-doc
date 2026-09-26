import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { PDFDocument } from "pdf-lib"
import { fixedAttachFilename, renderSourceFileForAttach } from "@/lib/integration-attach-rendition"

async function threePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let index = 0; index < 3; index++) doc.addPage([100, 100])
  return Buffer.from(await doc.save())
}

async function tinyImage(): Promise<Buffer> {
  return sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer()
}

describe("renderSourceFileForAttach", () => {
  it("cuts a page range out of a PDF into its own document", async () => {
    const buffer = await threePagePdf()
    const rendition = await renderSourceFileForAttach({ buffer, mimeType: "application/pdf", pageRange: "2" })
    expect(rendition.contentType).toBe("application/pdf")
    const cut = await PDFDocument.load(rendition.buffer)
    expect(cut.getPageCount()).toBe(1)
  })

  it("passes a whole PDF through unchanged when there is no page range", async () => {
    const buffer = await threePagePdf()
    const rendition = await renderSourceFileForAttach({ buffer, mimeType: "application/pdf", pageRange: null })
    expect(rendition.buffer).toBe(buffer)
    expect(rendition.contentType).toBe("application/pdf")
  })

  it("converts a HEIC image to JPEG", async () => {
    const buffer = await tinyImage()
    const rendition = await renderSourceFileForAttach({ buffer, mimeType: "image/heic", pageRange: null })
    expect(rendition.contentType).toBe("image/jpeg")
    expect((await sharp(rendition.buffer).metadata()).format).toBe("jpeg")
  })

  it("converts a WEBP image to JPEG", async () => {
    const buffer = await tinyImage()
    const rendition = await renderSourceFileForAttach({ buffer, mimeType: "image/webp", pageRange: null })
    expect(rendition.contentType).toBe("image/jpeg")
  })

  it("passes any other type through unchanged", async () => {
    const buffer = await tinyImage()
    const rendition = await renderSourceFileForAttach({ buffer, mimeType: "image/png", pageRange: null })
    expect(rendition.buffer).toBe(buffer)
    expect(rendition.contentType).toBe("image/png")
  })
})

describe("fixedAttachFilename", () => {
  it("strips every Xero-forbidden character", () => {
    expect(fixedAttachFilename('a<b>c:d"e/f\\g|h?i*j\0k+l.pdf')).toBe("abcdefghijkl.pdf")
  })

  it("leaves a name with none of the forbidden characters unchanged", () => {
    expect(fixedAttachFilename("invoice-2026.pdf")).toBe("invoice-2026.pdf")
  })

  it("falls back to a generic name when stripping empties the name entirely", () => {
    expect(fixedAttachFilename('<>:"/\\|?*\0+')).toBe("source-file")
  })

  it("keeps a surviving extension when only the stem is all forbidden characters", () => {
    expect(fixedAttachFilename('<>:"/\\|?*\0+.pdf')).toBe(".pdf")
  })
})

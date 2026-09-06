/** A2.6 wiring: pdfjs-dist adapter that extracts a PDF's EMBEDDED text layer — the text a
 * born-digital PDF ships with, distinct from what the OCR pass reads off the rendered pages.
 * The lib/checks/text-layer-divergence.ts checker compares the two.
 *
 * Node-side use of pdfjs is fiddly: the browser build tries to import DOMMatrix/Path2D and the
 * legacy build expects a global structuredClone. The dynamic import + explicit `.mjs` path is
 * the shape that works on Node 18+ without a canvas shim.
 *
 * Never throws: any pdfjs error (encrypted PDF, malformed stream, bundle-load failure) returns
 * null. A missing text layer isn't an error — a scanned PDF genuinely has none. */

const MAX_PAGES = 20

export async function extractPdfTextLayer(buffer: Buffer): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs" as string) as any
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise
    const pageCount = Math.min(doc.numPages, MAX_PAGES)
    const pageTexts: string[] = []
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const items = (content.items ?? []) as Array<{ str?: string; hasEOL?: boolean }>
      pageTexts.push(items.map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : " "}`).join("").trim())
    }
    await doc.destroy?.().catch?.(() => {})
    const joined = pageTexts.join("\n\n").trim()
    return joined || null
  } catch {
    return null
  }
}

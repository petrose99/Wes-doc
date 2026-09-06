import { describe, expect, it, vi } from "vitest"
import { checkVies } from "@/lib/suppliers/vies"

const okFetch = (xml: string) => vi.fn().mockResolvedValue({ ok: true, text: async () => xml } as unknown as Response)

describe("checkVies", () => {
  it("returns { known: false } when disabled or the VAT can't be parsed", async () => {
    expect(await checkVies("GB123456789", { enabled: false })).toEqual({ known: false })
    expect(await checkVies("not a vat", { fetch: okFetch("") })).toEqual({ known: false })
  })

  it("parses a valid VIES response and reports the registered name", async () => {
    const xml = "<checkVatResponse><valid>true</valid><name>Acme SPRL</name></checkVatResponse>"
    const result = await checkVies("BE0123456789", { fetch: okFetch(xml) })
    if (!result.known) throw new Error("expected known result")
    expect(result.valid).toBe(true)
    expect(result.registeredName).toBe("Acme SPRL")
    expect(result.countryCode).toBe("BE")
  })

  it("treats a placeholder name as null", async () => {
    const xml = "<valid>true</valid><name>---</name>"
    const result = await checkVies("DE123456789", { fetch: okFetch(xml) })
    if (!result.known) throw new Error("expected known")
    expect(result.registeredName).toBeNull()
  })

  it("degrades to { known: false } on a fetch failure", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("timeout"))
    expect(await checkVies("DE123456789", { fetch: fail })).toEqual({ known: false })
  })
})

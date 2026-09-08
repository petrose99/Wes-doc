import { describe, expect, it } from "vitest"
import { buttonWidthFor, createNonce } from "@/lib/google-identity"
import { createHash } from "node:crypto"

describe("createNonce", () => {
  it("hashes the raw nonce the way Supabase re-computes it", async () => {
    const { raw, hashed } = await createNonce()
    expect(hashed).toBe(createHash("sha256").update(raw).digest("hex"))
  })

  it("returns a distinct nonce per sign-in attempt", async () => {
    const [first, second] = await Promise.all([createNonce(), createNonce()])
    expect(first.raw).not.toBe(second.raw)
  })

  it("produces hex of the expected length from 32 random bytes", async () => {
    const { raw, hashed } = await createNonce()
    expect(raw).toMatch(/^[0-9a-f]{64}$/)
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("buttonWidthFor", () => {
  it("matches the container so the button lines up with the fields below it", () => {
    expect(buttonWidthFor({ offsetWidth: 320 })).toBe(320)
  })

  it("clamps to Google's 400px maximum", () => {
    expect(buttonWidthFor({ offsetWidth: 900 })).toBe(400)
  })

  it("keeps a narrow container above the width where Google truncates the label", () => {
    expect(buttonWidthFor({ offsetWidth: 120 })).toBe(200)
  })

  // A container measured before layout reports 0; rendering a 200px button is recoverable, a 0px
  // one is an invisible sign-in button.
  it("falls back to a usable width when the container has not been laid out yet", () => {
    expect(buttonWidthFor({ offsetWidth: 0 })).toBe(320)
  })
})

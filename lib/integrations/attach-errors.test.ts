import { describe, expect, it } from "vitest"
import { ATTACH_ERROR_SENTENCES, describeAttachError } from "@/lib/integrations/attach-errors"

describe("describeAttachError", () => {
  it("returns the mapped sentence fragment for a known code", () => {
    expect(describeAttachError("attach_source_missing")).toBe("the source file is no longer stored")
  })

  it("returns a mapped fragment for every listed code", () => {
    for (const code of Object.keys(ATTACH_ERROR_SENTENCES)) {
      expect(describeAttachError(code)).toBe(ATTACH_ERROR_SENTENCES[code])
    }
  })

  it("falls back to a humanized code for anything unlisted", () => {
    expect(describeAttachError("some_transient_error")).toBe("some transient error")
  })
})

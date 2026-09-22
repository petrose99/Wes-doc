import { describe, expect, it } from "vitest"
import { parseResourceSource } from "@/lib/resources"

const VALID = `---
title: "A real resource"
slug: "how-ap-fraud-happens"
description: "A description"
publishedAt: "2026-09-14"
category: "guides"
featureImage: "/resources/example.svg"
---

The body.`

describe("resource content model", () => {
  it("parses the fixed frontmatter schema and registers a product backlink", () => {
    expect(parseResourceSource(VALID)).toMatchObject({
      title: "A real resource",
      category: "guides",
      featureHref: "/product/controls",
      body: "The body.",
    })
  })

  it("rejects author and tags fields so the fixed editorial schema stays honest", () => {
    expect(() => parseResourceSource(VALID.replace("featureImage:", "author: DocuBite Team\nfeatureImage:"))).toThrow("author")
  })
})

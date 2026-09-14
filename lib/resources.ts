import fs from "node:fs"
import path from "node:path"

export const RESOURCE_CATEGORIES = ["guides", "product-deep-dives", "comparisons", "business-case"] as const
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number]

export type ResourcePost = {
  title: string
  slug: string
  description: string
  publishedAt: string
  category: ResourceCategory
  featureImage: string
  body: string
  featureHref: string
  featureLabel: string
}

type ResourceFrontmatter = Omit<ResourcePost, "body" | "featureHref" | "featureLabel">

/**
 * The post-to-product relationship is intentionally kept out of frontmatter. The content model
 * fixed by the Resources decision has no author, tags, or feature fields, while every post still
 * needs one honest route back into the product. Keeping that mapping here makes the requirement
 * executable without growing the editorial schema.
 */
const FEATURE_LINKS: Record<string, { href: string; label: string }> = {
  "how-ap-fraud-happens": { href: "/product/controls", label: "Explore Controls & fraud checks" },
  "three-way-matching-explained": { href: "/product/matching", label: "Explore Document matching" },
}

const REQUIRED_FIELDS = ["title", "slug", "description", "publishedAt", "category", "featureImage"] as const
const RESOURCE_DIRECTORY = path.join(process.cwd(), "content", "resources")

function readScalar(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFrontmatter(source: string, fileName: string): { frontmatter: ResourceFrontmatter; body: string } {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/)
  if (lines[0] !== "---") throw new Error(`${fileName}: resource files must start with frontmatter`)

  const end = lines.indexOf("---", 1)
  if (end === -1) throw new Error(`${fileName}: frontmatter is not closed`)

  const values: Record<string, string> = {}
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue
    const separator = line.indexOf(":")
    if (separator <= 0) throw new Error(`${fileName}: invalid frontmatter line: ${line}`)
    const key = line.slice(0, separator).trim()
    values[key] = readScalar(line.slice(separator + 1))
  }

  const missing = REQUIRED_FIELDS.filter((field) => !values[field])
  if (missing.length > 0) throw new Error(`${fileName}: missing required frontmatter: ${missing.join(", ")}`)

  const unsupported = Object.keys(values).filter((key) => !REQUIRED_FIELDS.includes(key as (typeof REQUIRED_FIELDS)[number]))
  if (unsupported.length > 0) {
    throw new Error(`${fileName}: unsupported frontmatter field(s): ${unsupported.join(", ")}`)
  }

  if (!/^[-a-z0-9]+$/.test(values.slug!)) throw new Error(`${fileName}: slug must contain lowercase letters, numbers, and hyphens only`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.publishedAt!) || Number.isNaN(Date.parse(`${values.publishedAt}T00:00:00Z`))) {
    throw new Error(`${fileName}: publishedAt must be an ISO date (YYYY-MM-DD)`)
  }
  if (!RESOURCE_CATEGORIES.includes(values.category as ResourceCategory)) {
    throw new Error(`${fileName}: category must be one of ${RESOURCE_CATEGORIES.join(", ")}`)
  }
  if (!values.featureImage!.startsWith("/")) throw new Error(`${fileName}: featureImage must be a public path`)

  return {
    frontmatter: {
      title: values.title!,
      slug: values.slug!,
      description: values.description!,
      publishedAt: values.publishedAt!,
      category: values.category as ResourceCategory,
      featureImage: values.featureImage!,
    },
    body: lines.slice(end + 1).join("\n").trim(),
  }
}

export function parseResourceSource(source: string, fileName = "resource.mdx"): ResourcePost {
  const { frontmatter, body } = parseFrontmatter(source, fileName)
  const feature = FEATURE_LINKS[frontmatter.slug]
  if (!feature) throw new Error(`${fileName}: no product feature route is registered for ${frontmatter.slug}`)
  if (!body) throw new Error(`${fileName}: resource body cannot be empty`)

  return { ...frontmatter, body, featureHref: feature.href, featureLabel: feature.label }
}

export function getResourcePosts(): ResourcePost[] {
  if (!fs.existsSync(RESOURCE_DIRECTORY)) return []
  return fs.readdirSync(RESOURCE_DIRECTORY)
    .filter((fileName) => fileName.endsWith(".mdx"))
    .map((fileName) => {
      const source = fs.readFileSync(path.join(RESOURCE_DIRECTORY, fileName), "utf8")
      return parseResourceSource(source, fileName)
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title))
}

export function getResourcePost(slug: string): ResourcePost | undefined {
  return getResourcePosts().find((post) => post.slug === slug)
}

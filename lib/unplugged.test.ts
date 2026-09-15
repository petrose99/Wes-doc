import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { isUnpluggedPath, UNPLUGGED_SEGMENTS, unplugged } from "./unplugged"

const WORKSPACE_ROUTES = path.join(process.cwd(), "app", "(app)", "workspaces", "[workspaceId]")

/** Where each unplugged segment's route directory lives — expenses sits inside the (chrome) group. */
const ROUTE_DIRS: Record<(typeof UNPLUGGED_SEGMENTS)[number], string> = {
  worksheets: path.join(WORKSPACE_ROUTES, "worksheets"),
  files: path.join(WORKSPACE_ROUTES, "files"),
  expenses: path.join(WORKSPACE_ROUTES, "(chrome)", "expenses"),
  dictation: path.join(WORKSPACE_ROUTES, "dictation"),
}

describe("unplugged surfaces (#238)", () => {
  it("unplugs exactly the surfaces the owner signed off on #237", () => {
    expect([...UNPLUGGED_SEGMENTS]).toEqual(["worksheets", "files", "expenses", "dictation"])
  })

  it("every unplugged route directory still exists (code kept) and carries the not-found layout", () => {
    for (const segment of UNPLUGGED_SEGMENTS) {
      const dir = ROUTE_DIRS[segment]
      expect(existsSync(path.join(dir, "page.tsx")), `${segment}/page.tsx kept`).toBe(true)
      expect(existsSync(path.join(dir, "layout.tsx")), `${segment}/layout.tsx present`).toBe(true)
    }
  })

  it("each of the four route layouts returns not-found", async () => {
    for (const segment of UNPLUGGED_SEGMENTS) {
      const mod = await import(path.join(ROUTE_DIRS[segment], "layout.tsx"))
      expect(() => mod.default(), `${segment} layout`).toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404/)
    }
  })

  it("unplugged() itself throws Next's not-found", () => {
    expect(() => unplugged()).toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404/)
  })

  it("recognises unplugged addresses and nothing else", () => {
    const base = "/workspaces/af91555d"
    expect(isUnpluggedPath(`${base}/worksheets`)).toBe(true)
    expect(isUnpluggedPath(`${base}/worksheets/abc/sheet`)).toBe(true)
    expect(isUnpluggedPath(`${base}/files/abc`)).toBe(true)
    expect(isUnpluggedPath(`${base}/expenses?mode=claims`)).toBe(true)
    expect(isUnpluggedPath(`${base}/dictation/abc`)).toBe(true)
    expect(isUnpluggedPath(`${base}/invoices`)).toBe(false)
    expect(isUnpluggedPath(`${base}/receipts?mode=claims`)).toBe(false)
    expect(isUnpluggedPath(`${base}`)).toBe(false)
    expect(isUnpluggedPath(`${base}/dashboard`)).toBe(false)
    expect(isUnpluggedPath("/workspaces")).toBe(false)
  })
})

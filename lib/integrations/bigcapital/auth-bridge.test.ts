import { readFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

/** bigcapital/auth-bridge.html is a bind-mounted static file — no bundler, no import graph, and
 * so nothing that would otherwise catch it drifting from what the Bigcapital SPA reads at boot.
 * It shipped once writing the session to the wrong place entirely, which cost a production
 * outage of "Open accounting", so the names it writes are pinned here.
 *
 * The script is run against a hand-rolled stub rather than jsdom: the surface it touches is four
 * globals wide, and the repo has no DOM test environment to borrow. */

const BRIDGE = path.join(process.cwd(), "bigcapital", "auth-bridge.html")

type Run = { cookies: Map<string, string>; attrs: string[]; storage: Map<string, string>; replaced: string | null; body: string }

function runBridge(payload: unknown, { protocol = "https:" } = {}): Run {
  const html = readFileSync(BRIDGE, "utf8")
  const script = html.slice(html.indexOf("<script>") + "<script>".length, html.indexOf("</script>"))

  const cookies = new Map<string, string>()
  const attrs: string[] = []
  const storage = new Map<string, string>()
  const run: Run = { cookies, attrs, storage, replaced: null, body: "" }

  const location = {
    hash: "#" + encodeURIComponent(JSON.stringify(payload)),
    protocol,
    replace: (url: string) => { run.replaced = url },
  }
  const document = {
    body: { set textContent(value: string) { run.body = value }, get textContent() { return run.body } },
    set cookie(value: string) {
      const [pair, ...rest] = value.split("; ")
      const eq = pair.indexOf("=")
      cookies.set(pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1)))
      attrs.push(rest.join("; "))
    },
  }
  const localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v) },
    removeItem: (k: string) => { storage.delete(k) },
  }

  new Function("window", "document", "location", "localStorage", script)({ location }, document, location, localStorage)
  return run
}

const session = { token: "jwt-1", organizationId: "org-1", userId: "7", tenantId: "3", returnUrl: "https://docubite.app/workspaces/w1" }

describe("auth-bridge.html", () => {
  it("writes the four cookies the SPA reads its auth state back from", () => {
    // These names are not ours to choose — they are what the SPA's own login page writes and what
    // its authentication slice reads at boot. Renaming any of them logs every user out.
    const { cookies } = runBridge(session)
    expect(Object.fromEntries(cookies)).toEqual({
      token: "jwt-1",
      organization_id: "org-1",
      authenticated_user_id: "7",
      tenant_id: "3",
    })
  })

  it("scopes every cookie to the whole site so the SPA sees it on any route", () => {
    const { attrs } = runBridge(session)
    expect(attrs).toHaveLength(4)
    for (const attr of attrs) {
      expect(attr).toContain("path=/")
      expect(attr).toContain("secure")
      expect(attr).toMatch(/expires=/)
    }
  })

  it("omits the Secure attribute off https, where it would silently drop the cookie", () => {
    const { attrs } = runBridge(session, { protocol: "http:" })
    for (const attr of attrs) expect(attr).not.toContain("secure")
  })

  it("signs in on token plus organization id alone", () => {
    // user_id/tenant_id are cosmetic — an instance that omits them must still sign in, not fail.
    const { cookies, replaced } = runBridge({ token: "jwt-1", organizationId: "org-1" })
    expect([...cookies.keys()]).toEqual(["token", "organization_id"])
    expect(replaced).toBe("/")
  })

  it("clears the localStorage key the broken version wrote", () => {
    const { storage } = runBridge(session)
    expect(storage.has("persist:bigcapital:authentication")).toBe(false)
    expect(storage.get("docubite:return-url")).toBe("https://docubite.app/workspaces/w1")
  })

  it("honours a redirect path", () => {
    expect(runBridge({ ...session, redirectPath: "/items" }).replaced).toBe("/items")
  })

  it("refuses a payload with no token rather than landing on a signed-out app", () => {
    const { cookies, replaced, body } = runBridge({ organizationId: "org-1" })
    expect(cookies.size).toBe(0)
    expect(replaced).toBeNull()
    expect(body).toContain("Sign-in failed")
  })
})

/** CI guard on the prompt snippets loaded on-demand by the assistant tool (#39). Every URL in
 * every `lib/jurisdictions/<code>/prompts/*.md` must resolve to a jurisdiction-appropriate
 * primary source — SARS/Treasury/HMRC/IRS/LRA or a `.gov` host in the pack's own country.
 *
 * The guard is deliberately per-pack-strict rather than a shared allowlist so a ZA snippet can't
 * silently start citing HMRC and vice-versa. Add a pack: extend `ALLOWED_HOSTS_BY_PACK`. */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const PROMPT_ROOT = join(process.cwd(), "lib", "jurisdictions")

/** Suffix match — a host `www.sars.gov.za` matches `sars.gov.za`. Ticket #50 fixes the ZA list;
 * later packs graduate their own list here. */
const ALLOWED_HOSTS_BY_PACK: Record<string, string[]> = {
  za: ["sars.gov.za", "treasury.gov.za"],
}

function listPackDirs(): string[] {
  return readdirSync(PROMPT_ROOT).filter((entry) => {
    const p = join(PROMPT_ROOT, entry)
    try {
      return statSync(p).isDirectory() && statSync(join(p, "prompts")).isDirectory()
    } catch {
      return false
    }
  })
}

function listPromptFiles(pack: string): string[] {
  const dir = join(PROMPT_ROOT, pack, "prompts")
  return readdirSync(dir).filter((f) => f.endsWith(".md"))
}

// Match `<http(s)://…>` or bare `http(s)://…` URLs. Angle-bracketed refs are the CommonMark form.
const URL_RE = /https?:\/\/[^\s)>\]]+/g

function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase()
  return allowed.some((a) => h === a || h.endsWith(`.${a}`))
}

describe("prompts CI guard (#50 DoD)", () => {
  const packs = listPackDirs()

  it("finds at least the ZA pack's prompts folder", () => {
    expect(packs).toContain("za")
  })

  for (const pack of packs) {
    const allowed = ALLOWED_HOSTS_BY_PACK[pack]
    if (!allowed) continue

    it(`every URL in ${pack}/prompts/*.md hits an allowed primary source`, () => {
      const files = listPromptFiles(pack)
      expect(files.length).toBeGreaterThan(0)
      const offences: string[] = []
      for (const file of files) {
        const body = readFileSync(join(PROMPT_ROOT, pack, "prompts", file), "utf8")
        const urls = body.match(URL_RE) ?? []
        for (const url of urls) {
          try {
            const host = new URL(url).host
            if (!hostAllowed(host, allowed)) offences.push(`${file}: ${url}`)
          } catch {
            offences.push(`${file}: malformed URL ${url}`)
          }
        }
      }
      expect(offences).toEqual([])
    })
  }

  it("rejects a fabricated non-primary URL (guard fires as intended)", () => {
    // Simulate the guard on synthetic content so the acceptance test doesn't require an actual
    // bad `.md` on disk (that would break the previous per-pack assertion).
    const body = "> Source: <https://example.com/vat-guide/> — not a SARS URL."
    const urls = body.match(URL_RE) ?? []
    const bad = urls.some((url) => {
      const host = new URL(url).host
      return !hostAllowed(host, ALLOWED_HOSTS_BY_PACK.za)
    })
    expect(bad).toBe(true)
  })
})

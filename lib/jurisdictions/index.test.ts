import { describe, expect, it } from "vitest"
import { JURISDICTION_CODES, JURISDICTION_NAMES, listAvailableJurisdictions, resolveJurisdictionPack } from "@/lib/jurisdictions"

describe("jurisdiction registry", () => {
  it("lists the four intended launch codes", () => {
    expect([...JURISDICTION_CODES].sort()).toEqual(["GB", "LS", "US-CA", "ZA"])
  })

  it("gives every intended code a display name", () => {
    for (const code of JURISDICTION_CODES) expect(JURISDICTION_NAMES[code]).toBeTruthy()
  })

  it("resolves the ZA pack (stub) with a stable packVersion", () => {
    const pack = resolveJurisdictionPack("ZA")
    expect(pack).not.toBeNull()
    expect(pack?.code).toBe("ZA")
    expect(pack?.packVersion).toMatch(/^za-v/)
  })

  it("returns null for a code with no pack file (ZA-only ship is valid)", () => {
    // LS / GB / US-CA are enumerated in JURISDICTION_CODES but have no PACK_LOADERS entry yet
    // (their content ships in #43 / #37 / #38). The registry must return null rather than throw.
    expect(resolveJurisdictionPack("LS")).toBeNull()
    expect(resolveJurisdictionPack("GB")).toBeNull()
    expect(resolveJurisdictionPack("US-CA")).toBeNull()
  })

  it("returns null for null / undefined / unknown codes", () => {
    expect(resolveJurisdictionPack(null)).toBeNull()
    expect(resolveJurisdictionPack(undefined)).toBeNull()
    expect(resolveJurisdictionPack("XX")).toBeNull()
    expect(resolveJurisdictionPack("")).toBeNull()
  })

  it("listAvailableJurisdictions only returns codes with a registered pack", () => {
    const available = listAvailableJurisdictions()
    expect(available.map((j) => j.code)).toEqual(["ZA"])
    expect(available[0]).toMatchObject({ code: "ZA", name: "South Africa" })
    expect(available[0].packVersion).toMatch(/^za-v/)
  })
})

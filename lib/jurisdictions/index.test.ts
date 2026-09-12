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

  it("resolves the LS pack with a stable packVersion (added by #74)", () => {
    const pack = resolveJurisdictionPack("LS")
    expect(pack).not.toBeNull()
    expect(pack?.code).toBe("LS")
    expect(pack?.packVersion).toMatch(/^ls-v/)
  })

  it("returns null for codes without a pack file yet (GB / US-CA)", () => {
    // GB / US-CA are enumerated but have no PACK_LOADERS entry (their rule packs are still to ship
    // — decisions closed in #37 / #38, code is fog beyond map #35). The registry must return null
    // rather than throw.
    expect(resolveJurisdictionPack("GB")).toBeNull()
    expect(resolveJurisdictionPack("US-CA")).toBeNull()
  })

  it("returns null for null / undefined / unknown codes", () => {
    expect(resolveJurisdictionPack(null)).toBeNull()
    expect(resolveJurisdictionPack(undefined)).toBeNull()
    expect(resolveJurisdictionPack("XX")).toBeNull()
    expect(resolveJurisdictionPack("")).toBeNull()
  })

  it("listAvailableJurisdictions returns registered packs in JURISDICTION_CODES order", () => {
    const available = listAvailableJurisdictions()
    // ZA sits before LS in JURISDICTION_CODES; the helper preserves that order.
    expect(available.map((j) => j.code)).toEqual(["ZA", "LS"])
    expect(available[0]).toMatchObject({ code: "ZA", name: "South Africa" })
    expect(available[0].packVersion).toMatch(/^za-v/)
    expect(available[1]).toMatchObject({ code: "LS", name: "Lesotho" })
    expect(available[1].packVersion).toMatch(/^ls-v/)
  })
})

import { describe, expect, it } from "vitest"
import { normalizeItemMatchKey, resolveItemLine, type ItemOption, type ItemPairing } from "./item-line-resolution"

const widget: ItemOption = {
  externalId: "item-1",
  code: "WID-1",
  accountExternalId: "acct-1",
  taxCodeExternalId: "tax-1",
  trackedInventory: false,
  active: true,
}

const gadget: ItemOption = {
  externalId: "item-2",
  code: "GAD-2",
  accountExternalId: "acct-2",
  taxCodeExternalId: "tax-2",
  trackedInventory: true,
  active: true,
}

describe("normalizeItemMatchKey", () => {
  it("prefers the trimmed/lowercased item code", () => {
    expect(normalizeItemMatchKey(" WID-1 ", "Widget")).toBe("wid-1")
  })

  it("falls back to the normalized description when no code", () => {
    expect(normalizeItemMatchKey(null, "  Blue Widget  ")).toBe(normalizeItemMatchKey(null, "blue widget"))
  })

  it("returns null when neither is present", () => {
    expect(normalizeItemMatchKey(null, null)).toBeNull()
    expect(normalizeItemMatchKey("", "")).toBeNull()
  })
})

describe("resolveItemLine", () => {
  it("wins on a pairing over the item's own code match", () => {
    const pairings: ItemPairing[] = [{ matchKey: "wid-1", itemExternalId: gadget.externalId }]
    const result = resolveItemLine({
      itemCode: "WID-1",
      description: null,
      prior: null,
      pairings,
      items: [widget, gadget],
    })
    expect(result).toEqual({
      itemExternalId: "item-2",
      itemSource: "pairing",
      accountExternalId: "acct-2",
      taxCodeExternalId: "tax-2",
    })
  })

  it("falls through to a code match when the paired item is no longer active", () => {
    const inactiveGadget = { ...gadget, active: false }
    const pairings: ItemPairing[] = [{ matchKey: "wid-1", itemExternalId: inactiveGadget.externalId }]
    const result = resolveItemLine({
      itemCode: "WID-1",
      description: null,
      prior: null,
      pairings,
      items: [widget, inactiveGadget],
    })
    expect(result.itemSource).toBe("code_match")
    expect(result.itemExternalId).toBe("item-1")
  })

  it("matches on the item's own code when no pairing exists", () => {
    const result = resolveItemLine({
      itemCode: "gad-2",
      description: null,
      prior: null,
      pairings: [],
      items: [widget, gadget],
    })
    expect(result.itemSource).toBe("code_match")
    expect(result.itemExternalId).toBe("item-2")
  })

  it("resolves to nothing when no pairing or code matches", () => {
    const result = resolveItemLine({
      itemCode: "unknown",
      description: "Consulting fee",
      prior: null,
      pairings: [],
      items: [widget, gadget],
    })
    expect(result).toEqual({ itemExternalId: null, itemSource: null, accountExternalId: null, taxCodeExternalId: null })
  })

  it("keeps a manual selection as-is when the item is still active", () => {
    const result = resolveItemLine({
      itemCode: null,
      description: null,
      prior: { item_external_id: "item-1", item_source: "manual" },
      pairings: [],
      items: [widget, gadget],
    })
    expect(result).toEqual({
      itemExternalId: "item-1",
      itemSource: "manual",
      accountExternalId: "acct-1",
      taxCodeExternalId: "tax-1",
    })
  })

  it("keeps a manual selection's identity even when the item has since gone inactive", () => {
    const result = resolveItemLine({
      itemCode: null,
      description: null,
      prior: { item_external_id: "item-1", item_source: "manual" },
      pairings: [],
      items: [{ ...widget, active: false }, gadget],
    })
    expect(result.itemExternalId).toBe("item-1")
    expect(result.itemSource).toBe("manual")
    expect(result.accountExternalId).toBeNull()
  })

  it("never matches on a close-but-not-exact code (no fuzzy matching)", () => {
    const closeCode: ItemOption = { ...widget, externalId: "item-3", code: "WID-10" }
    const result = resolveItemLine({
      itemCode: "WID-1",
      description: null,
      prior: null,
      pairings: [],
      items: [closeCode],
    })
    expect(result.itemSource).toBeNull()
  })
})

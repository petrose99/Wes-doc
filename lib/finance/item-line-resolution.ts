import { normalizeSupplierName } from "@/lib/suppliers/normalize"

/** #459 / ADR 0015: pure per-line item resolution. A line's Item is resolved before its Account —
 * a matched item overrides the account chain in models/documents.ts::resolveDocumentCodingItems.
 * Never fuzzy: a pairing or an exact code match wins, otherwise the line stays an account line. No
 * Prisma, no provider calls — the caller reads pairings/items and passes them in. */

export type ItemSource = "pairing" | "code_match" | "manual"

export type ItemOption = {
  externalId: string
  code: string | null
  accountExternalId: string
  taxCodeExternalId: string | null
  trackedInventory: boolean
  active: boolean
}

export type ItemPairing = {
  matchKey: string
  itemExternalId: string
}

export type ItemLineResolution = {
  itemExternalId: string | null
  itemSource: ItemSource | null
  accountExternalId: string | null
  taxCodeExternalId: string | null
}

/** A pairing's match key: the supplier's own item code (trimmed/lowercased) when printed, else the
 * normalized line description — reuses normalizeSupplierName so casing/whitespace rules match the
 * ones supplier names already use. */
export function normalizeItemMatchKey(itemCode: string | null, description: string | null): string | null {
  const code = itemCode?.trim().toLowerCase()
  if (code) return code
  return normalizeSupplierName(description) || null
}

function toResolution(item: ItemOption, source: ItemSource): ItemLineResolution {
  return {
    itemExternalId: item.externalId,
    itemSource: source,
    accountExternalId: item.accountExternalId,
    taxCodeExternalId: item.taxCodeExternalId,
  }
}

const NONE: ItemLineResolution = { itemExternalId: null, itemSource: null, accountExternalId: null, taxCodeExternalId: null }

export function resolveItemLine(input: {
  itemCode: string | null
  description: string | null
  prior: { item_external_id: string | null; item_source: ItemSource | null } | null
  pairings: ItemPairing[]
  items: ItemOption[]
}): ItemLineResolution {
  if (input.prior?.item_source === "manual") {
    const kept = input.items.find((item) => item.externalId === input.prior?.item_external_id && item.active)
    if (kept) return toResolution(kept, "manual")
    return { itemExternalId: input.prior.item_external_id, itemSource: "manual", accountExternalId: null, taxCodeExternalId: null }
  }

  const matchKey = normalizeItemMatchKey(input.itemCode, input.description)
  if (matchKey) {
    const pairing = input.pairings.find((row) => row.matchKey === matchKey)
    if (pairing) {
      const item = input.items.find((row) => row.externalId === pairing.itemExternalId && row.active)
      if (item) return toResolution(item, "pairing")
    }
  }

  const code = input.itemCode?.trim().toLowerCase()
  if (code) {
    const item = input.items.find((row) => row.active && row.code?.trim().toLowerCase() === code)
    if (item) return toResolution(item, "code_match")
  }

  return NONE
}

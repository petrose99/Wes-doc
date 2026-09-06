import { describe, expect, it } from "vitest"
import { inferFieldSnapshot, extractFreeFormProvenance } from "./infer-schema"
import { DOC_TYPE_SPECS } from "@/lib/doc-types"

describe("inferFieldSnapshot", () => {
  it("infers types from an invoice-like extraction", () => {
    const merged = {
      vendor: "Acme Corp",
      invoice_number: "INV-001",
      issue_date: "2025-06-15",
      total: 1500.50,
      currency_code: "USD",
      line_items: [
        { description: "Widget A", quantity: 10, unit_price: 100.00, amount: 1000.00 },
        { description: "Widget B", quantity: 5, unit_price: 100.10, amount: 500.50 },
      ],
      _confidence: { vendor: 0.95 },
      _provenance: {},
    }

    const fields = inferFieldSnapshot(merged, DOC_TYPE_SPECS.invoice)

    expect(fields.length).toBe(6)
    const vendorField = fields.find((f) => f.key === "vendor")
    expect(vendorField?.type).toBe("string")
    const dateField = fields.find((f) => f.key === "issue_date")
    expect(dateField?.type).toBe("date")
    const totalField = fields.find((f) => f.key === "total")
    expect(totalField?.type).toBe("number")
    const lineItemsField = fields.find((f) => f.key === "line_items")
    expect(lineItemsField?.type).toBe("array")
    expect(lineItemsField?.itemFields).toHaveLength(4)
  })

  it("puts canonical keys first in spec order, discovered keys after alphabetically", () => {
    const merged = {
      vendor: "Acme",
      total: 100,
      zebra_field: "z",
      alpha_field: "a",
    }
    const fields = inferFieldSnapshot(merged, DOC_TYPE_SPECS.invoice)
    const keys = fields.map((f) => f.key)
    expect(keys.indexOf("vendor")).toBeLessThan(keys.indexOf("total"))
    expect(keys.indexOf("total")).toBeLessThan(keys.indexOf("alpha_field"))
    expect(keys.indexOf("alpha_field")).toBeLessThan(keys.indexOf("zebra_field"))
  })

  it("works without a spec", () => {
    const merged = { title: "Test", amount: 42.5, paid: true }
    const fields = inferFieldSnapshot(merged)
    expect(fields).toHaveLength(3)
    expect(fields.find((f) => f.key === "amount")?.type).toBe("number")
    expect(fields.find((f) => f.key === "paid")?.type).toBe("boolean")
    expect(fields.every((f) => f.label)).toBe(true)
  })

  it("skips meta keys", () => {
    const merged = { vendor: "X", _confidence: {}, _provenance: {}, _classification: {} }
    const fields = inferFieldSnapshot(merged)
    expect(fields).toHaveLength(1)
    expect(fields[0].key).toBe("vendor")
  })

  it("skips null/undefined/empty values", () => {
    const merged = { vendor: "X", empty: "", nullable: null, undef: undefined }
    const fields = inferFieldSnapshot(merged)
    expect(fields).toHaveLength(1)
  })

  it("infers item fields from array rows", () => {
    const merged = {
      transactions: [
        { date: "2025-01-01", description: "Deposit", amount: 500.00 },
        { date: "2025-01-02", description: "Withdrawal", amount: -200.00, balance: 300 },
      ],
    }
    const fields = inferFieldSnapshot(merged, DOC_TYPE_SPECS.bank_statement)
    const txnField = fields.find((f) => f.key === "transactions")
    expect(txnField?.type).toBe("array")
    expect(txnField?.itemFields?.find((f) => f.key === "date")?.type).toBe("date")
    expect(txnField?.itemFields?.find((f) => f.key === "amount")?.type).toBe("number")
  })
})

describe("extractFreeFormProvenance", () => {
  it("extracts scalar and array provenance", () => {
    const output = {
      vendor: "Acme",
      line_items: [{ description: "Widget" }],
      _provenance: {
        vendor: { page: 1, quote: "Acme Corp" },
        line_items: [{ page: 2, quote: "Widget A" }],
      },
    }
    const prov = extractFreeFormProvenance(output)
    expect(prov.fields.vendor).toEqual({ page: 1, quote: "Acme Corp" })
    expect(prov.items.line_items).toHaveLength(1)
    expect(prov.items.line_items[0]?.page).toBe(2)
  })

  it("handles missing provenance gracefully", () => {
    const prov = extractFreeFormProvenance({ vendor: "X" })
    expect(prov.fields).toEqual({})
    expect(prov.items).toEqual({})
  })

  it("drops invalid hints", () => {
    const prov = extractFreeFormProvenance({
      _provenance: { vendor: "not an object", date: { page: -1, quote: "" } },
    })
    expect(prov.fields.vendor).toBeUndefined()
    expect(prov.fields.date).toBeUndefined()
  })
})

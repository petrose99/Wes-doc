import { describe, expect, it } from "vitest"
import {
  DOC_TYPES,
  DOC_TYPE_SPECS,
  resolveDocType,
  resolveDocTypeSpec,
  legacyTemplateCodeToDocType,
  docTypeToLegacyTemplateCode,
  isDocType,
  counterpartyFieldForDoc,
  checkFieldsForDoc,
  amountKeysForDoc,
  matchRoleForDoc,
  isPushableDocument,
  isCategoryConfirmed,
  EXPENSE_DOC_TYPES,
  PUSHABLE_DOC_TYPES,
  type DocType,
} from "./doc-types"

describe("DOC_TYPE_SPECS totality", () => {
  it("has a spec for every DOC_TYPE", () => {
    for (const t of DOC_TYPES) {
      expect(DOC_TYPE_SPECS[t]).toBeDefined()
      expect(DOC_TYPE_SPECS[t].label).toBeTruthy()
      expect(DOC_TYPE_SPECS[t].canonicalKeys.length).toBeGreaterThan(0)
    }
  })

  it("every spec has a valid defaultCategory", () => {
    for (const t of DOC_TYPES) {
      expect(["expense", "sale", "other"]).toContain(DOC_TYPE_SPECS[t].defaultCategory)
    }
  })

  it("canonical keys have non-empty key and hint", () => {
    for (const t of DOC_TYPES) {
      for (const ck of DOC_TYPE_SPECS[t].canonicalKeys) {
        expect(ck.key).toBeTruthy()
        expect(ck.hint).toBeTruthy()
      }
    }
  })
})

describe("legacy bridge round-trips", () => {
  const LEGACY_CODES = [
    "invoice", "receipt", "expense_receipt", "purchase_order",
    "bank_statement", "remittance_advice", "supplier_statement",
    "general_report", "generic",
  ]

  it("every legacy code maps to a valid DocType", () => {
    for (const code of LEGACY_CODES) {
      const dt = legacyTemplateCodeToDocType(code)
      expect(isDocType(dt)).toBe(true)
    }
  })

  it("every DocType round-trips through the legacy bridge (canonical codes)", () => {
    const canonicalRoundTrips: [DocType, string][] = [
      ["invoice", "invoice"],
      ["receipt", "receipt"],
      ["bank_statement", "bank_statement"],
      ["purchase_order", "purchase_order"],
    ]
    for (const [docType, expectedLegacy] of canonicalRoundTrips) {
      expect(docTypeToLegacyTemplateCode(docType)).toBe(expectedLegacy)
      expect(legacyTemplateCodeToDocType(expectedLegacy)).toBe(docType)
    }
  })

  it("expense_receipt maps to receipt", () => {
    expect(legacyTemplateCodeToDocType("expense_receipt")).toBe("receipt")
  })

  it("unknown code maps to other", () => {
    expect(legacyTemplateCodeToDocType("totally_unknown")).toBe("other")
  })

  it("new types without legacy equivalents map to generic", () => {
    for (const t of ["delivery_note", "contract", "payslip", "tax_form", "other"] as const) {
      expect(docTypeToLegacyTemplateCode(t)).toBe("generic")
    }
  })
})

describe("resolveDocType", () => {
  it("prefers explicit docType column", () => {
    expect(resolveDocType({ docType: "invoice", template: { code: "receipt" } })).toBe("invoice")
  })

  it("falls back to template.code", () => {
    expect(resolveDocType({ docType: null, template: { code: "purchase_order" } })).toBe("purchase_order")
  })

  it("falls back to other when neither present", () => {
    expect(resolveDocType({ docType: null, template: null })).toBe("other")
    expect(resolveDocType({})).toBe("other")
  })

  it("rejects invalid docType strings", () => {
    expect(resolveDocType({ docType: "not_a_type" })).toBe("other")
  })

  it("resolveDocTypeSpec returns the spec for the resolved type", () => {
    const spec = resolveDocTypeSpec({ template: { code: "invoice" } })
    expect(spec.label).toBe("Invoice")
    expect(spec.counterpartyField).toBe("vendor")
  })
})

describe("helper functions", () => {
  const invoiceDoc = { docType: "invoice" as const }
  const receiptDoc = { template: { code: "receipt" } }
  const bankDoc = { docType: "bank_statement" as const }
  const otherDoc = { docType: "other" as const }

  it("counterpartyFieldForDoc", () => {
    expect(counterpartyFieldForDoc(invoiceDoc)).toBe("vendor")
    expect(counterpartyFieldForDoc(receiptDoc)).toBe("merchant")
    expect(counterpartyFieldForDoc(bankDoc)).toBeUndefined()
  })

  it("checkFieldsForDoc", () => {
    const fields = checkFieldsForDoc(invoiceDoc)
    expect(fields?.supplier).toBe("vendor")
    expect(fields?.total).toBe("total")
    expect(checkFieldsForDoc(otherDoc)).toBeUndefined()
  })

  it("amountKeysForDoc", () => {
    const keys = amountKeysForDoc(invoiceDoc)
    expect(keys?.total).toBe("total")
    expect(keys?.lineItems).toBe("line_items")
    expect(amountKeysForDoc(otherDoc)).toBeUndefined()
  })

  it("matchRoleForDoc", () => {
    expect(matchRoleForDoc(invoiceDoc)).toBe("invoice")
    expect(matchRoleForDoc({ docType: "purchase_order" })).toBe("po")
    expect(matchRoleForDoc(receiptDoc)).toBe("receipt")
    expect(matchRoleForDoc(bankDoc)).toBeNull()
  })
})

describe("derived constants", () => {
  it("EXPENSE_DOC_TYPES includes invoice, receipt, purchase_order, payslip", () => {
    expect(EXPENSE_DOC_TYPES).toContain("invoice")
    expect(EXPENSE_DOC_TYPES).toContain("receipt")
    expect(EXPENSE_DOC_TYPES).toContain("purchase_order")
    expect(EXPENSE_DOC_TYPES).toContain("payslip")
    expect(EXPENSE_DOC_TYPES).not.toContain("bank_statement")
    expect(EXPENSE_DOC_TYPES).not.toContain("other")
  })

  it("PUSHABLE_DOC_TYPES matches the accounting-push module", () => {
    expect(PUSHABLE_DOC_TYPES).toEqual(["invoice", "receipt", "bank_statement"])
  })
})

describe("isDocType", () => {
  it("accepts all valid types", () => {
    for (const t of DOC_TYPES) expect(isDocType(t)).toBe(true)
  })
  it("rejects invalid strings", () => {
    expect(isDocType("foo")).toBe(false)
    expect(isDocType("")).toBe(false)
  })
})

describe("isPushableDocument", () => {
  it("accepts pushable doc types", () => {
    expect(isPushableDocument({ docType: "invoice" })).toBe(true)
    expect(isPushableDocument({ docType: "receipt" })).toBe(true)
    expect(isPushableDocument({ docType: "bank_statement" })).toBe(true)
  })
  it("rejects non-pushable doc types", () => {
    expect(isPushableDocument({ docType: "contract" })).toBe(false)
    expect(isPushableDocument({ docType: "other" })).toBe(false)
  })
  it("works with legacy template codes", () => {
    expect(isPushableDocument({ template: { code: "invoice" } })).toBe(true)
    expect(isPushableDocument({ template: { code: "expense_receipt" } })).toBe(true)
  })
})

describe("isCategoryConfirmed", () => {
  it("returns true for human-confirmed category", () => {
    expect(isCategoryConfirmed({ documentTypeSource: "human", documentType: "expense" })).toBe(true)
  })
  it("returns true when categoryConfirmed flag is set", () => {
    expect(isCategoryConfirmed({ documentTypeSource: "ai", categoryConfirmed: true })).toBe(true)
  })
  it("returns false for unconfirmed AI category", () => {
    expect(isCategoryConfirmed({ documentTypeSource: "ai", documentType: "expense" })).toBe(false)
  })
  it("returns false for null/empty coding data", () => {
    expect(isCategoryConfirmed(null)).toBe(false)
    expect(isCategoryConfirmed({})).toBe(false)
  })
})

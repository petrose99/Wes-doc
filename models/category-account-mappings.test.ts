import { describe, expect, it } from "vitest"
import { resolveCategoryAccount, type CategoryAccountMappingRow } from "@/models/category-account-mappings"

describe("resolveCategoryAccount", () => {
  const mappings: CategoryAccountMappingRow[] = [
    { id: "1", category: "Office Supplies", kind: "expense", accountExternalId: "acc-100" },
    { id: "2", category: "Travel", kind: "expense", accountExternalId: "acc-200" },
    { id: "3", category: "Sales", kind: "income", accountExternalId: "acc-300" },
  ]
  const inferred = { "Software": "acc-400", "Office Supplies": "acc-999" }
  const defaultId = "acc-default"

  it("prefers explicit mapping over inferred", () => {
    expect(resolveCategoryAccount(mappings, "Office Supplies", inferred, defaultId)).toBe("acc-100")
  })

  it("falls back to inferred when no explicit mapping exists", () => {
    expect(resolveCategoryAccount(mappings, "Software", inferred, defaultId)).toBe("acc-400")
  })

  it("falls back to default when neither explicit nor inferred", () => {
    expect(resolveCategoryAccount(mappings, "Utilities", inferred, defaultId)).toBe("acc-default")
  })

  it("returns default for null category", () => {
    expect(resolveCategoryAccount(mappings, null, inferred, defaultId)).toBe("acc-default")
  })

  it("respects kind filter", () => {
    expect(resolveCategoryAccount(mappings, "Sales", inferred, defaultId, "income")).toBe("acc-300")
    expect(resolveCategoryAccount(mappings, "Sales", inferred, defaultId, "expense")).toBe("acc-default")
  })
})

import { describe, expect, it } from "vitest"
import { applyFieldTable, labelForKey, lockedRequiredKeys, orderColumnsByFieldTable, resolveFieldTable } from "@/lib/configuration/field-table"

describe("resolveFieldTable (#231 Q11 / #252)", () => {
  it("renders every canonical key in its canonical order with the code's defaults when nothing is stored", () => {
    const table = resolveFieldTable("invoice", [], [])
    // The synthetic Direction row (#297) is pinned first for direction-bearing types.
    expect(table.rows[0]).toMatchObject({ key: "__direction", direction: true, position: 0 })
    expect(table.rows[1]).toMatchObject({ key: "vendor", label: "Supplier", editable: true, required: true, requiredLocked: true, width: "normal", position: 1, stored: false })
    // Optional check fields are not locked — forcing IBAN required would hold every invoice without one.
    expect(table.rows.find((row) => row.key === "payment_iban")).toMatchObject({ required: false, requiredLocked: false })
    expect(table.rows.find((row) => row.key === "shipping_total")).toMatchObject({ requiredLocked: false })
    expect(table.rows.map((row) => row.key)).toContain("po_number")
    expect(table.rows.every((row) => !row.custom)).toBe(true)
  })

  it("keeps the fields checks read required even when the overlay says otherwise, and required implies editable", () => {
    const table = resolveFieldTable("invoice", [], [{ fieldKey: "total", editable: false, required: false, width: "wide", position: 0 }, { fieldKey: "due_date", editable: false, required: false, width: "normal", position: 1 }])
    const total = table.rows.find((row) => row.key === "total")!
    expect(total).toMatchObject({ required: true, requiredLocked: true, editable: true, width: "wide", position: 1 })
    expect(table.rows.find((row) => row.key === "due_date")).toMatchObject({ required: false, editable: false })
    expect(lockedRequiredKeys("receipt").has("merchant")).toBe(true)
  })

  it("appends custom template fields after the canonical ones, skipping keys the canonical list has", () => {
    const table = resolveFieldTable("invoice", [{ key: "cost_centre", label: "Cost centre", required: true }, { key: "vendor", label: "Dup" }], [])
    const custom = table.rows.filter((row) => row.custom)
    expect(custom).toHaveLength(1)
    expect(custom[0]).toMatchObject({ key: "cost_centre", label: "Cost centre", required: true, requiredLocked: false })
    expect(custom[0].position).toBe(table.rows.length - 1)
  })

  it("orders by stored position and renumbers contiguously", () => {
    const table = resolveFieldTable("purchase_order", [], [
      { fieldKey: "total", editable: true, required: true, width: "normal", position: 0 },
      { fieldKey: "supplier", editable: true, required: true, width: "normal", position: 1 },
    ])
    // Purchase Order has a locked Direction row (#297), pinned before any stored position.
    expect(table.rows.slice(0, 3).map((row) => row.key)).toEqual(["__direction", "total", "supplier"])
    expect(table.rows.map((row) => row.position)).toEqual(table.rows.map((_, index) => index))
  })

  it("takes Required defaults from the template until a row is stored, and the pane keeps template flags for unstored rows", () => {
    const table = resolveFieldTable("invoice", [], [], { due_date: { required: true } })
    expect(table.rows.find((row) => row.key === "due_date")).toMatchObject({ required: true, stored: false })
    const fields = applyFieldTable([{ key: "due_date", label: "Due date", type: "string", required: false }] as never, table)
    expect(fields[0].required).toBe(false)
  })

  it("sentence-cases keys", () => {
    expect(labelForKey("statement_period_start")).toBe("Statement period start")
  })

  it("injects the Direction row only for direction-bearing types, locked and footnoted for Purchase Order", () => {
    expect(resolveFieldTable("bank_statement", [], []).rows.some((row) => row.direction)).toBe(false)
    const po = resolveFieldTable("purchase_order", [], []).rows.find((row) => row.direction)!
    expect(po).toMatchObject({ editable: true, required: true, requiredLocked: true })
    expect(po.hint).toContain("always payable")
  })
})

describe("applyFieldTable", () => {
  it("sets required and readOnly from stored rows (required implies editable); unknown keys pass through", () => {
    const table = resolveFieldTable("invoice", [], [
      { fieldKey: "due_date", editable: false, required: true, width: "normal", position: 3 },
      { fieldKey: "payment_terms", editable: false, required: false, width: "normal", position: 4 },
    ])
    const fields = applyFieldTable([
      { key: "due_date", label: "Due date", type: "string", required: false },
      { key: "payment_terms", label: "Payment terms", type: "string", required: false },
      { key: "mystery", label: "Mystery", type: "string", required: true },
    ] as never, table)
    // Required wins over a stored editable=false: a required field a reviewer cannot fill would hold a document nobody can free.
    expect(fields[0]).toMatchObject({ required: true })
    expect("readOnly" in fields[0] && fields[0].readOnly === true).toBe(false)
    expect(fields[1]).toMatchObject({ required: false, readOnly: true })
    expect(fields[2]).toMatchObject({ required: true })
    expect("readOnly" in fields[2]).toBe(false)
  })
})

describe("orderColumnsByFieldTable", () => {
  const columns = [
    { key: "supplier", fieldKey: "vendor" },
    { key: "number", fieldKey: "invoice_number" },
    { key: "amount", fieldKey: "total" },
    { key: "due", fieldKey: "due_date" },
    { key: "state" },
  ]
  it("leaves the columns alone with no table", () => {
    expect(orderColumnsByFieldTable(columns, null)).toBe(columns)
  })
  it("keeps the title column first, orders field columns by the table, hides Hidden ones, and trails the rest", () => {
    const table = resolveFieldTable("invoice", [], [
      { fieldKey: "due_date", editable: true, required: false, width: "narrow", position: 0 },
      { fieldKey: "total", editable: true, required: true, width: "normal", position: 1 },
      { fieldKey: "invoice_number", editable: true, required: true, width: "hidden", position: 2 },
    ])
    expect(orderColumnsByFieldTable(columns, table).map((column) => column.key)).toEqual(["supplier", "due", "amount", "state"])
  })
})

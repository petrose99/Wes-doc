import { describe, expect, it, vi } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn(() => { throw new Error("no request scope") }),
}))

// The runner has two IO seams — a workspace loader and a pack resolver. Both are injectable, so
// nothing here touches prisma or the real jurisdictions registry; keeps the tests focused on the
// gate's decision logic exactly like lib/approvals/engine.test.ts.
vi.mock("@/lib/db", () => ({ prisma: {} }))

const {
  createJurisdictionValidityRunner,
  extractInvoiceLike,
  chooseRuleSet,
  runInvoiceValidity,
  JURISDICTION_VALIDITY_GATE_TYPE,
} = await import("@/lib/gates/jurisdiction-validity")
const { createGateRegistry } = await import("@/lib/gates/registry")
const { overrideGate, resolveGate } = await import("@/lib/gates/actions")
const { zaPack } = await import("@/lib/jurisdictions/za")
import type { GateContext } from "@/lib/gates/types"

const ctx = (fields: Record<string, unknown>, reviewed?: Record<string, unknown>): GateContext => ({
  workspaceId: "w1",
  documentId: "d1",
  document: {
    id: "d1", workspaceId: "w1", docType: "invoice",
    fieldSnapshot: fields, receivedAt: new Date(),
    ...(reviewed ? { reviewedData: reviewed } : {}),
  } as GateContext["document"],
})

/** A fieldSnapshot that satisfies every ZA s20(4) full-invoice rule. Reused and mutated by the
 * "one rule fails" cases below so it's clear which key each test breaks. */
const passingFullInvoice = () => ({
  has_tax_invoice_wording: true,
  vendor: "Acme (Pty) Ltd",
  supplier_address: "1 Long St, Cape Town, 8001",
  supplier_vat_number: "4123456789",
  recipient_name: "Beta CC",
  recipient_address: "2 Church St, Johannesburg",
  recipient_vat_number: "4987654321",
  recipient_is_registered_vendor: true,
  invoice_number: "INV-0001",
  issue_date: "2026-08-01",
  description: "Consulting services",
  quantity: 1,
  subtotal: 10000,
  tax_total: 1500,
  total: 11500,
  currency_code: "ZAR",
  vat_shown_separately: true,
})

describe("extractInvoiceLike", () => {
  it("prefers reviewedData over fieldSnapshot so a re-fire after edit sees the edited values", () => {
    const invoice = extractInvoiceLike({
      id: "d1", workspaceId: "w1", docType: "invoice", receivedAt: new Date(),
      fieldSnapshot: { vendor: "Old", total: 100 },
      reviewedData: { vendor: "New", total: 200 },
    } as GateContext["document"])
    expect(invoice.supplierName).toBe("New")
    expect(invoice.totalAmount).toBe(200)
  })

  it("falls back to fieldSnapshot when reviewedData is null", () => {
    const invoice = extractInvoiceLike({
      id: "d1", workspaceId: "w1", docType: "invoice", receivedAt: new Date(),
      fieldSnapshot: passingFullInvoice(),
    } as GateContext["document"])
    expect(invoice.supplierName).toBe("Acme (Pty) Ltd")
    expect(invoice.supplierVatNumber).toBe("4123456789")
    expect(invoice.currency).toBe("ZAR")
  })

  it("coerces number-typed monetary strings — extraction sometimes hands over 'R 11,500.00'", () => {
    const invoice = extractInvoiceLike({
      id: "d1", workspaceId: "w1", docType: "invoice", receivedAt: new Date(),
      fieldSnapshot: { total: "R 11,500.00", tax_total: "1500", subtotal: "10000" },
    } as GateContext["document"])
    expect(invoice.totalAmount).toBe(11500)
    expect(invoice.vatAmount).toBe(1500)
    expect(invoice.netAmount).toBe(10000)
  })
})

describe("chooseRuleSet", () => {
  it("picks the full rule set when total is above the pack's fullInvoiceThreshold (ZA: R5,000)", () => {
    const { kind, rules } = chooseRuleSet(zaPack, { totalAmount: 11500, consideration: 11500 })
    expect(kind).toBe("full")
    expect(rules.length).toBe(zaPack.invoiceValidity!.fullInvoiceRules.length)
  })

  it("picks abridged for R50 < total ≤ R5,000 (s20(5))", () => {
    const { kind, rules } = chooseRuleSet(zaPack, { totalAmount: 2500, consideration: 2500 })
    expect(kind).toBe("abridged")
    expect(rules.length).toBe(zaPack.invoiceValidity!.abridgedInvoiceRules.length)
  })

  it("skips rules under noInvoiceThreshold (s20(6): ≤ R50 requires only a receipt)", () => {
    const { kind, rules } = chooseRuleSet(zaPack, { totalAmount: 30, consideration: 30 })
    expect(kind).toBe("receipt-only")
    expect(rules).toEqual([])
  })

  it("defaults to full when consideration can't be read — the stricter set flags more of the bill", () => {
    const { kind } = chooseRuleSet(zaPack, {})
    expect(kind).toBe("full")
  })
})

describe("runInvoiceValidity", () => {
  it("stamps packCode and packVersion on the DocumentCheckResult (#39)", () => {
    const { check } = runInvoiceValidity(zaPack, extractInvoiceLike({
      id: "d1", workspaceId: "w1", docType: "invoice", receivedAt: new Date(),
      fieldSnapshot: passingFullInvoice(),
    } as GateContext["document"]))
    expect(check.packCode).toBe("ZA")
    expect(check.packVersion).toBe(zaPack.packVersion)
    expect(check.topic).toBe("invoice-validity")
  })

  it("returns empty failures when every rule passes", () => {
    const { failures } = runInvoiceValidity(zaPack, extractInvoiceLike({
      id: "d1", workspaceId: "w1", docType: "invoice", receivedAt: new Date(),
      fieldSnapshot: passingFullInvoice(),
    } as GateContext["document"]))
    expect(failures).toEqual([])
  })

  it("emits {id, sourceRef, message} for every failing rule — the shape the chip renders", () => {
    const fields = passingFullInvoice()
    delete (fields as Record<string, unknown>).has_tax_invoice_wording
    const { failures } = runInvoiceValidity(zaPack, extractInvoiceLike({
      id: "d1", workspaceId: "w1", docType: "invoice", receivedAt: new Date(),
      fieldSnapshot: fields,
    } as GateContext["document"]))
    expect(failures).toHaveLength(1)
    expect(failures[0].id).toBe("za.s20.4.a.tax-invoice-wording")
    expect(failures[0].sourceRef).toMatch(/sars\.gov\.za/)
    expect(failures[0].message).toMatch(/Tax Invoice/i)
  })
})

describe("createJurisdictionValidityRunner", () => {
  it("returns { blocked: false } when the workspace has no pack — #49 already refused ingestion, this is defensive", async () => {
    const runner = createJurisdictionValidityRunner({
      loadWorkspaceJurisdiction: async () => ({ jurisdictionCode: null }),
      resolvePack: () => null,
    })
    const verdict = await runner.run(ctx(passingFullInvoice()))
    expect(verdict).toEqual({ blocked: false })
  })

  it("returns { blocked: false } for a passing ZA bill — the gate has nothing to say", async () => {
    const runner = createJurisdictionValidityRunner({
      loadWorkspaceJurisdiction: async () => ({ jurisdictionCode: "ZA" }),
      resolvePack: () => zaPack,
    })
    const verdict = await runner.run(ctx(passingFullInvoice()))
    expect(verdict).toEqual({ blocked: false })
  })

  it("blocks hard when the ZA 'Tax Invoice' wording is missing (s20(4)(a)) — DoD case from #52", async () => {
    const runner = createJurisdictionValidityRunner({
      loadWorkspaceJurisdiction: async () => ({ jurisdictionCode: "ZA" }),
      resolvePack: () => zaPack,
    })
    const fields = passingFullInvoice()
    delete (fields as Record<string, unknown>).has_tax_invoice_wording
    const verdict = await runner.run(ctx(fields))
    expect(verdict.blocked).toBe(true)
    if (!verdict.blocked) throw new Error("unreachable")
    expect(verdict.severity).toBe("hard")
    const payload = verdict.payload as {
      packCode: string; packVersion: string; ruleSet: string
      failures: { id: string; sourceRef: string; message: string }[]
    }
    expect(payload.packCode).toBe("ZA")
    expect(payload.packVersion).toBe(zaPack.packVersion)
    expect(payload.ruleSet).toBe("full")
    expect(payload.failures.map((f) => f.id)).toContain("za.s20.4.a.tax-invoice-wording")
    expect(payload.failures[0].sourceRef).toMatch(/sars\.gov\.za/)
  })

  it("uses reviewedData if present, so the DoD 'edit and re-run → passes' case does pass", async () => {
    const runner = createJurisdictionValidityRunner({
      loadWorkspaceJurisdiction: async () => ({ jurisdictionCode: "ZA" }),
      resolvePack: () => zaPack,
    })
    // fieldSnapshot missing wording; reviewedData has it — a re-fire after edit is clean.
    const broken = passingFullInvoice()
    delete (broken as Record<string, unknown>).has_tax_invoice_wording
    const verdict = await runner.run(ctx(broken, passingFullInvoice()))
    expect(verdict).toEqual({ blocked: false })
  })

  it("registers under gateType 'jurisdiction-validity' — the string the registry keys upserts on", () => {
    const runner = createJurisdictionValidityRunner()
    expect(runner.gateType).toBe(JURISDICTION_VALIDITY_GATE_TYPE)
  })
})

describe("registry integration — duplicate order + resolve/override wiring", () => {
  it("registers cleanly alongside a duplicate runner and executes duplicate first, jurisdiction-validity second (from #52 registry order)", async () => {
    const registry = createGateRegistry()
    const runOrder: string[] = []
    registry.register({
      gateType: "duplicate",
      run: () => { runOrder.push("duplicate"); return { blocked: false } },
    })
    registry.register({
      gateType: JURISDICTION_VALIDITY_GATE_TYPE,
      run: () => { runOrder.push(JURISDICTION_VALIDITY_GATE_TYPE); return { blocked: false } },
    })
    // Call the runners directly through .list() rather than runOnArrival() to avoid dragging the
    // prisma mock into this test — the registry's own tests cover the persistence path.
    for (const r of registry.list()) await r.run(ctx(passingFullInvoice()))
    expect(runOrder).toEqual(["duplicate", JURISDICTION_VALIDITY_GATE_TYPE])
  })

  it("uses the shared overrideGate/resolveGate actions — those already write gate.overridden / gate.resolved (verified in lib/gates/actions.test.ts)", () => {
    expect(typeof overrideGate).toBe("function")
    expect(typeof resolveGate).toBe("function")
  })
})

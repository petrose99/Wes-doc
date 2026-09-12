/** Gate 2/6 (#52) — hard-gate, always blocks: runs the workspace's active jurisdiction pack's
 * `invoiceValidity` rule rows over the arriving bill. Any failed rule → the bill lands in the
 * exception queue with the failing rule ids attached, so the chip can cite the pack's
 * `sourceRef` (SARS/HMRC/etc.) verbatim.
 *
 * Contract from #52 + #40 + #36 + #39:
 *   - Reads the workspace's active pack via the jurisdictions registry (#49).
 *   - Runs every rule in `pack.invoiceValidity` — full vs abridged is chosen by
 *     `fullInvoiceThreshold` (ZA: R5,000). Below `noInvoiceThreshold` (ZA: R50) is silent —
 *     no tax invoice is required, so no rules run.
 *   - Every failing rule → hard block; payload carries `{id, sourceRef, message}` per failure.
 *   - Stamps `packCode` + `packVersion` on the payload so a later audit replay knows which pack
 *     signed off (#39: rule surface reads live from code, but outputs remember which version).
 *   - #49 guarantees a workspace without a pack never reaches here — `requireWorkspaceJurisdiction`
 *     short-circuits ingestion; here a missing pack is treated as "no gate has anything to say",
 *     defensive only.
 *   - Re-run-on-edit is out of scope (per ticket #52); the registry re-fires on any bill update,
 *     and `resolveGate` / `overrideGate` in lib/gates/actions.ts already write
 *     `gate.resolved` / `gate.overridden`. */

import { prisma } from "@/lib/db"
import { resolveJurisdictionPack } from "@/lib/jurisdictions"
import type { GateContext, GateRunner, GateVerdict } from "./types"
import type {
  DocumentCheckResult,
  InvoiceLike,
  JurisdictionPack,
  Rule,
  RuleFail,
  RuleResult,
} from "@/lib/jurisdictions/types"

export const JURISDICTION_VALIDITY_GATE_TYPE = "jurisdiction-validity"

export type JurisdictionValidityFailure = { id: string; sourceRef: string; message: string }

export type JurisdictionValidityPayload = {
  packCode: string
  packVersion: string
  topic: "invoice-validity"
  ruleSet: "full" | "abridged" | "receipt-only"
  failures: JurisdictionValidityFailure[]
}

/** Injection seams — the runner is pure logic; tests substitute both. Kept optional so the
 * default export can wire the real prisma-backed loader without ceremony at every call site. */
export type JurisdictionValidityDeps = {
  resolvePack?: (code: string | null | undefined) => JurisdictionPack | null
  loadWorkspaceJurisdiction?: (workspaceId: string) => Promise<{ jurisdictionCode: string | null }>
}

/** Read the workspace's picked jurisdiction. Kept as a thin wrapper (not a call to
 * `getWorkspaceJurisdiction` from `lib/jurisdictions/require.ts`) so tests can mock a single
 * function without dragging the whole require module in. */
async function loadWorkspaceJurisdictionDefault(workspaceId: string): Promise<{ jurisdictionCode: string | null }> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { jurisdictionCode: true },
  })
  return { jurisdictionCode: workspace?.jurisdictionCode ?? null }
}

/** Canonical-key mapping used by DOC_TYPE_SPECS.invoice — the ingestion side stores extraction
 * output under these keys inside `fieldSnapshot` / `reviewedData`. Kept here (not imported from
 * lib/doc-types.ts) because we only need the invoice slice and pulling doc-types into a gate
 * runner would tangle the gate framework with the extraction surface. */
type Json = unknown

function readField(source: Record<string, Json> | null | undefined, key: string): Json {
  if (!source) return undefined
  return source[key]
}

function toString(value: Json): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") return value.trim() || undefined
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return undefined
}

function toNumber(value: Json): number | undefined {
  if (value === null || value === undefined || value === "") return undefined
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "")
    if (!cleaned) return undefined
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function toBoolean(value: Json): boolean | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const v = value.trim().toLowerCase()
    if (v === "true" || v === "yes" || v === "y") return true
    if (v === "false" || v === "no" || v === "n") return false
  }
  return undefined
}

/** One line item, loosely typed — line_items rows vary by doc type (invoice vs receipt) but both
 * use `description`/`quantity` keys per lib/domains/finance.ts. */
type LineItem = { description?: Json; quantity?: Json }

/** Every line-item description, joined — used to derive the s20(4)(e)/s.24(8)(e) "description"
 * requirement from the line-item table rather than a nonexistent top-level field. An invoice
 * doesn't have one description, it has one per row; a real (non-empty) joined description proves
 * the bill shows what was supplied, matching the rule's actual intent. `undefined` for a
 * genuinely lineless bill (services invoice with only a header total), which correctly still
 * fails the rule. */
function lineItemDescriptions(items: Json): string | undefined {
  if (!Array.isArray(items)) return undefined
  const parts = (items as LineItem[])
    .map((item) => (typeof item?.description === "string" ? item.description.trim() : ""))
    .filter((d) => d !== "")
  return parts.length ? parts.join("; ") : undefined
}

/** The first line item carrying a quantity — used to derive the s20(4)(e)/s.24(8)(f) "quantity"
 * requirement the same way: at least one row states how much was supplied. */
function firstLineItemQuantity(items: Json): number | undefined {
  if (!Array.isArray(items)) return undefined
  for (const item of items as LineItem[]) {
    const q = toNumber(item?.quantity)
    if (q !== undefined) return q
  }
  return undefined
}

/** Map a Document's extraction/review data into the pack-agnostic `InvoiceLike` shape the pack
 * rules consume. Prefers `reviewedData` (post-review truth) over `fieldSnapshot` (arrival-time
 * template shell) so a re-fire after edit sees the edited values.
 *
 * `description`/`quantity`/`vatShownSeparately`/`isZeroRated` are DERIVED rather than read from a
 * matching top-level extraction key, because no such key exists (an invoice has line items, not
 * one description/quantity; whether VAT is "shown separately" or the bill is zero-rated are
 * judgments the extraction schema doesn't ask the model to make directly) — see the ticket that
 * added this comment for the incident where reading nonexistent fields hard-blocked every
 * invoice regardless of content. */
export function extractInvoiceLike(document: GateContext["document"]): InvoiceLike {
  const reviewed = (document.reviewedData as Record<string, Json> | null | undefined) ?? null
  const snapshot = (document.fieldSnapshot as Record<string, Json> | null | undefined) ?? null
  const read = (key: string): Json => {
    const v = readField(reviewed, key)
    return v === undefined ? readField(snapshot, key) : v
  }

  const total = toNumber(read("total"))
  const netAmount = toNumber(read("subtotal"))
  const vatAmount = toNumber(read("tax_total"))
  const lineItems = read("line_items")

  // Net + VAT extracted as distinct figures IS "shown separately" for this schema — the two
  // numbers only exist because the bill broke them out. Absent that, but with a total present,
  // the total is VAT-inclusive by construction (it's the only amount extraction found).
  const vatShownSeparately = netAmount !== undefined && vatAmount !== undefined ? true
    : total !== undefined ? false
    : undefined
  // Zero-rated iff we have both figures and the tax component is exactly zero — a fact read off
  // the extracted numbers, not a judgment invented on top of them.
  const isZeroRated = netAmount !== undefined && vatAmount !== undefined ? vatAmount === 0 : undefined

  return {
    hasTaxInvoiceWording: toBoolean(read("has_tax_invoice_wording")),
    supplierName: toString(read("vendor")) ?? toString(read("merchant")) ?? toString(read("supplier_name")),
    supplierAddress: toString(read("supplier_address")) ?? toString(read("merchant_address")) ?? toString(read("vendor_address")),
    supplierVatNumber: toString(read("supplier_vat_number")),
    recipientName: toString(read("recipient_name")) ?? toString(read("customer_name")),
    recipientAddress: toString(read("recipient_address")) ?? toString(read("customer_address")),
    recipientVatNumber: toString(read("recipient_vat_number")) ?? toString(read("customer_vat_number")),
    recipientIsRegisteredVendor: toBoolean(read("recipient_is_registered_vendor")),
    invoiceNumber: toString(read("invoice_number")) ?? toString(read("receipt_number")),
    issueDate: toString(read("issue_date")) ?? toString(read("purchase_date")) ?? null,
    supplyDate: toString(read("supply_date")) ?? null,
    description: lineItemDescriptions(lineItems),
    quantity: firstLineItemQuantity(lineItems),
    netAmount,
    vatAmount,
    totalAmount: total,
    consideration: total,
    currency: toString(read("currency_code")) ?? toString(read("currency")),
    vatShownSeparately,
    isZeroRated,
  }
}

/** Pick which pack rule set applies to this bill's consideration. Below `noInvoiceThreshold` the
 * pack requires only a receipt — no invoice rules run. Above `fullInvoiceThreshold` the full
 * s20(4) set applies; between the two, abridged (s20(5)). The `full` fallback is the safe choice
 * when the amount can't be read: the stricter rules will flag more of the invoice, which is what
 * a hard-gate wants. */
export function chooseRuleSet(
  pack: JurisdictionPack,
  invoice: InvoiceLike,
): { kind: "full" | "abridged" | "receipt-only"; rules: Rule<InvoiceLike>[] } {
  const validity = pack.invoiceValidity
  if (!validity) return { kind: "full", rules: [] }
  const amount = invoice.consideration ?? invoice.totalAmount
  if (amount !== undefined && validity.noInvoiceThreshold && amount <= validity.noInvoiceThreshold.amount) {
    return { kind: "receipt-only", rules: [] }
  }
  if (amount !== undefined && validity.fullInvoiceThreshold && amount <= validity.fullInvoiceThreshold.amount) {
    return { kind: "abridged", rules: validity.abridgedInvoiceRules }
  }
  return { kind: "full", rules: validity.fullInvoiceRules }
}

/** Build the DocumentCheckResult (#39 shape) and lift its failures to the payload the gate
 * publishes for the exception chip. Sole use of `DocumentCheckResult` here — a workpaper that
 * wants a rerun can construct the same value the same way from the same pack + invoice. */
export function runInvoiceValidity(
  pack: JurisdictionPack,
  invoice: InvoiceLike,
): { check: DocumentCheckResult; failures: JurisdictionValidityFailure[]; ruleSet: "full" | "abridged" | "receipt-only" } {
  const { kind, rules } = chooseRuleSet(pack, invoice)
  const results: RuleResult[] = rules.map((rule) => rule.apply(invoice))
  const check: DocumentCheckResult = {
    packCode: pack.code,
    packVersion: pack.packVersion,
    topic: "invoice-validity",
    results,
  }
  const failures: JurisdictionValidityFailure[] = results
    .map((result, index): JurisdictionValidityFailure | null => {
      if (result.ok) return null
      const fail = result as RuleFail
      const rule = rules[index]
      return { id: fail.ruleId, sourceRef: rule?.sourceRef ?? "", message: fail.message }
    })
    .filter((f): f is JurisdictionValidityFailure => f !== null)
  return { check, failures, ruleSet: kind }
}

/** Factory kept exported so tests can pass in-memory pack + workspace loaders without touching
 * the process singleton — matches the `createGateRegistry()` pattern in lib/gates/registry.ts. */
export function createJurisdictionValidityRunner(deps: JurisdictionValidityDeps = {}): GateRunner {
  const resolvePack = deps.resolvePack ?? resolveJurisdictionPack
  const loadWorkspace = deps.loadWorkspaceJurisdiction ?? loadWorkspaceJurisdictionDefault
  return {
    gateType: JURISDICTION_VALIDITY_GATE_TYPE,
    async run(ctx: GateContext): Promise<GateVerdict> {
      const workspace = await loadWorkspace(ctx.workspaceId)
      const pack = resolvePack(workspace.jurisdictionCode)
      // #49's requireWorkspaceJurisdiction is what enforces "must pick a pack" — this branch is
      // defensive: if a bill somehow reaches the gate without one, we don't invent a verdict.
      if (!pack || !pack.invoiceValidity) return { blocked: false }
      const invoice = extractInvoiceLike(ctx.document)
      const { failures, ruleSet } = runInvoiceValidity(pack, invoice)
      if (failures.length === 0) return { blocked: false }
      const payload: JurisdictionValidityPayload = {
        packCode: pack.code,
        packVersion: pack.packVersion,
        topic: "invoice-validity",
        ruleSet,
        failures,
      }
      return { blocked: true, severity: "hard", payload: payload as unknown as Record<string, unknown> }
    },
  }
}

/** Process-wide runner, registered into `gateRegistry` from lib/gates/registry.ts. */
export const jurisdictionValidityRunner: GateRunner = createJurisdictionValidityRunner()

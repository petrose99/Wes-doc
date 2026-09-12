/** Wayfinder decision #39 fixed the pack shape: one directory per jurisdiction under
 * `lib/jurisdictions/<code>/`, one file per topic (invoice-validity / input-tax / filings /
 * retention / thresholds / border), all re-exported from that directory's `index.ts` alongside a
 * stable `packVersion` string. Ticket #49 shipped the picker + a ZA stub; #50 lands the real ZA
 * pack content; other jurisdictions arrive on their own tickets.
 *
 * The registry (see `./index.ts`) enumerates the intended codes but treats each pack file as
 * optional — a code with no pack file is not offered by the picker, so a ZA-only ship is valid. */
export type JurisdictionCode = "ZA" | "LS" | "GB" | "US-CA"

/** Rule outcomes. `apply` returns either an ok marker or a fail carrying the ruleId + a
 * human-readable message. Gates that consume packs turn a Fail into a blocking chip. */
export type RuleOk = { ok: true }
export type RuleFail = { ok: false; ruleId: string; message: string }
export type RuleResult = RuleOk | RuleFail

/** A single rule row. `id` is the stable identity used to correlate to a prompt snippet under
 * `<pack>/prompts/<id>.md`; `sourceRef` is a URL to the primary source the rule was written from
 * (SARS/HMRC/IRS/LRA + `.gov` for their host countries). */
export type Rule<D> = {
  id: string
  sourceRef: string
  apply: (doc: D) => RuleResult
}

/** Result of running one topic's rules over a document. Gates stamp `packVersion` here so an
 * audit event can be replayed against the pack version that produced it (#39: rules read live
 * from code, but their outputs remember which pack signed off). */
export type DocumentCheckResult = {
  packCode: JurisdictionCode
  packVersion: string
  topic: PackTopic
  results: RuleResult[]
}

export type PackTopic =
  | "invoice-validity"
  | "input-tax"
  | "filings"
  | "retention"
  | "thresholds"
  | "border"
  | "workpapers"

/** Threshold row with an effective-from date so ZA's 1 Apr 2026 R1m→R2.3m jump can coexist with
 * its pre-jump value; consumers pick the row whose window contains the date under test. */
export type ThresholdRow = {
  id: string
  sourceRef: string
  currency: string
  amount: number
  effectiveFrom: string // ISO date
  effectiveTo: string | null
}

/** Filing form field descriptor (e.g. VAT201 box 14). No apply() — filings are data the
 * workpaper writes into; the invariant rules live alongside as regular Rule rows. */
export type FilingField = {
  id: string
  label: string
  sourceRef: string
}

export type JurisdictionPack = {
  code: JurisdictionCode
  /** Stamped on workspace settings when the pack is picked and on every DocumentCheckResult when
   * a rule from this pack runs. Bump when the rule surface changes materially. */
  packVersion: string
  invoiceValidity?: {
    /** Threshold at which the full-invoice rule set applies; below this a jurisdiction may allow
     * an abridged invoice (ZA s20(5): consideration ≤ R5,000). */
    fullInvoiceThreshold?: { currency: string; amount: number }
    /** Sub-threshold under which only a receipt/till slip is required (ZA s20(6): R50). */
    noInvoiceThreshold?: { currency: string; amount: number }
    fullInvoiceRules: Rule<InvoiceLike>[]
    abridgedInvoiceRules: Rule<InvoiceLike>[]
  }
  inputTax?: {
    rules: Rule<InputTaxClaim>[]
    /** VAT201-style split fields the workpaper feeds. */
    fields: FilingField[]
  }
  filings?: {
    /** e.g. "VAT201". */
    formId: string
    fields: FilingField[]
    /** Standard tax rate at the current point in time (rate history stays in `lib/tax/regions`). */
    standardRate: number
    dueDay: number
    rules: Rule<FilingDraft>[]
  }
  retention?: {
    /** Years a valid tax invoice must be retained. */
    years: number
    rules: Rule<RetentionCheck>[]
  }
  thresholds?: {
    compulsoryRegistration: ThresholdRow[]
    voluntaryRegistration: ThresholdRow[]
  }
  border?: {
    /** Free-form arrangement id (e.g. "sars-rsl-common-border"). */
    id: string
    sourceRef: string
    description: string
    rules: Rule<BorderInvoice>[]
  }
  /** Workpapers this pack contributes (#47/#68). A pack with no workpapers is a valid state —
   * the close checklist reads `resolveWorkpapersForJurisdiction(pack)` and treats an empty list
   * as "no automated workpaper for this jurisdiction yet". */
  workpapers?: readonly import("./_shared/workpaper").Workpaper[]
}

/** Minimum invoice fields needed to run the s20 checks. Every field is optional so the rules
 * themselves can report which one is missing. All monetary fields are in the invoice's stated
 * currency; s20 requires ZAR unless the supply is zero-rated. */
export type InvoiceLike = {
  consideration?: number
  currency?: string
  hasTaxInvoiceWording?: boolean
  supplierName?: string
  supplierAddress?: string
  supplierVatNumber?: string
  recipientName?: string
  recipientAddress?: string
  recipientVatNumber?: string
  recipientIsRegisteredVendor?: boolean
  invoiceNumber?: string
  issueDate?: string | null
  supplyDate?: string | null
  description?: string
  quantity?: number
  netAmount?: number
  vatAmount?: number
  totalAmount?: number
  vatShownSeparately?: boolean
  isZeroRated?: boolean
}

export type InputTaxClaim = {
  hasValidTaxInvoice: boolean
  isCapital: boolean
  isImported: boolean
  consideration?: number
  currency?: string
}

export type FilingDraft = {
  formId: string
  /** Field id → captured monetary value. */
  fields: Record<string, number>
}

export type RetentionCheck = {
  invoiceDate: string // ISO date
  today?: string // ISO date; defaults to now
}

export type BorderInvoice = {
  originCountry: string // ISO-3166 alpha-2
  destinationCountry: string
  supplierVatNumber?: string
  issueDate?: string // ISO
  today?: string // ISO
}

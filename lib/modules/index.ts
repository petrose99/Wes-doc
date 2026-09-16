import type { Industry } from "@/types/industry"

/** The module registry: every feature area the app knows about, keyed by module key. Mirrors
 * lib/domains/index.ts's shape — a flat array + pure lookup functions, no database — so capability
 * checks (lib/modules/capabilities.ts) and the sidebar/catalog UI (Part 3/4) read a module's
 * behaviour from here rather than branching on industry strings throughout the app. Adding a
 * module is one entry below (plus, if it gates a real feature, one requireModule call site) —
 * never a new ad-hoc `workspace.industry === "..."` check.
 *
 * tier: "always" — on for every workspace of its industry, not toggleable (this is what replaces
 * the old two-value assertMode gate for core surfaces). "default" — on unless a row in
 * WorkspaceModule disables it. "optional" — off unless enabled (activation "enable") or requested
 * (activation "request", surfaced to the owner as a request rather than a self-serve toggle). */
export type ModuleTier = "always" | "default" | "optional"
export type ModuleActivation = "enable" | "request"

export type ModuleDefinition = {
  key: string
  name: string
  description: string
  /** "core" modules are shared across every industry (documents, sheets, search, assistant,
   * reports) — modulesForIndustry always includes them alongside the workspace's own industry. */
  industry: Industry | "core"
  tier: ModuleTier
  activation: ModuleActivation
  navItems?: { href: string; label: string; icon: string }[]
  /** A prerequisite the workspace/deployment must satisfy before the module can be enabled at
   * all, independent of the industry/tier gating resolveModules already does. */
  requiresConfig?: "asr" | "integrations" | "embeddings"
  /** Document template codes this module can push to an external accounting system once enabled. */
  pushableTemplateCodes?: string[]
  /** The lib/domains adapter set this module's worksheets are drawn from, for seeding (lib/modules/seeds.ts). */
  domainPack?: "finance"
  /** Optional-tier template codes this module materializes into a file when enabled (via the same
   * addDomainPackToFile mechanism the templates settings page already uses for domain packs). */
  optionalTemplateCodes?: string[]
}

export const MODULES: ModuleDefinition[] = [
  { key: "documents", name: "Documents", description: "Upload, store, and organize source documents.", industry: "core", tier: "always", activation: "enable" },
  { key: "sheets", name: "Worksheets", description: "Structured extraction worksheets over your documents.", industry: "core", tier: "always", activation: "enable" },
  { key: "search", name: "Search", description: "Cross-document semantic search.", industry: "core", tier: "always", activation: "enable" },
  { key: "assistant", name: "AI Assistant", description: "Ask questions and take actions across your workspace.", industry: "core", tier: "always", activation: "enable" },
  { key: "reports", name: "Reports", description: "Draft and export reports from extracted data.", industry: "core", tier: "always", activation: "enable" },

  // #236: renamed from "Review queue" — the module still gates the same capability
  // (createReviewTask, decideReviewTaskStage, …), but the user-facing surface is now the
  // Approvals destination (Ready to Approve / PO Mismatches), not a standalone Review queue.
  // navItems dropped: the sidebar hardcodes the Approvals rail entry the same way it already
  // does for Exceptions, rather than driving it off a module nav item.
  { key: "review-queue", name: "Approvals", description: "Route submitted invoices through approval stages, and triage documents that need a person to look at them first.", industry: "finance", tier: "always", activation: "enable" },
  // Approval workflows is workflow *configuration*, reachable from the Automation page's own tabs
  // (Approvals lives at /automation/approvals). It used to declare a sidebar navItem, which
  // produced a duplicate "Approvals" rail entry alongside Automation itself — the audit flagged
  // that as the clearest instance of the same destination being advertised twice.
  { key: "approval-workflows", name: "Approval workflows", description: "Route a document through multiple approval stages before it's marked approved.", industry: "finance", tier: "always", activation: "enable" },
  { key: "supplier-rules", name: "Supplier rules", description: "Auto-code recurring suppliers and, optionally, auto-publish them.", industry: "finance", tier: "always", activation: "enable", navItems: [{ href: "admin/suppliers", label: "Suppliers", icon: "workflow" }] },
  { key: "document-checks", name: "Document checks", description: "Deterministic duplicate, arithmetic, tax, and gap checks on every document.", industry: "finance", tier: "always", activation: "enable" },
  // Renamed from "tax-profiles" (#49) — the module now surfaces the workspace jurisdiction picker;
  // rate snapshots keep their existing TaxProfileVersion behaviour (rates stay retroactive; rule
  // packs read live from lib/jurisdictions/<code>/). Existing WorkspaceModule rows are re-keyed
  // by the 20260911100000_add_workspace_jurisdiction migration.
  { key: "jurisdiction", name: "Tax", description: "The company's tax jurisdiction, rate snapshots, and rule pack — required before email intake accepts an invoice.", industry: "finance", tier: "always", activation: "enable", navItems: [{ href: "admin/configuration/tax", label: "Tax", icon: "landmark" }] },
  { key: "accounting-push", name: "Accounting push", description: "Push invoices, receipts, and expenses to QuickBooks or Xero.", industry: "finance", tier: "always", activation: "enable", requiresConfig: "integrations", pushableTemplateCodes: ["invoice", "receipt", "expense_receipt", "bank_statement"] },
  { key: "finance-agent", name: "Finance agent", description: "An AI assistant with finance-specific tools: coding, rules, and pushes.", industry: "finance", tier: "always", activation: "enable" },
  { key: "statement-packs", name: "Statement packs", description: "Bank statements, purchase orders, remittance advice, and supplier statements.", industry: "finance", tier: "always", activation: "enable", domainPack: "finance", optionalTemplateCodes: ["bank_statement", "purchase_order", "remittance_advice", "supplier_statement"] },
  { key: "expense-approvals", name: "Expense approvals", description: "Submit, approve, and publish employee expense claims.", industry: "finance", tier: "always", activation: "enable", navItems: [{ href: "expenses", label: "Expenses", icon: "receipt" }] },
  { key: "bank-match", name: "Bank matching", description: "Match statement lines to receipts automatically.", industry: "finance", tier: "always", activation: "enable" },
  // No navItems: the sidebar special-cases this module's entry (an "Overview" link to the
  // workspace root, not a `${base}/${href}` segment) since an empty href would produce a broken
  // trailing-slash nav item.
  { key: "finance-analytics", name: "Financial analytics", description: "Spend by category, cash flow trend, and AP aging built from your extracted documents.", industry: "finance", tier: "always", activation: "enable" },

  { key: "dictation", name: "Dictation", description: "Speech-to-structured-report dictation.", industry: "finance", tier: "always", activation: "enable", requiresConfig: "asr", navItems: [{ href: "dictation", label: "Dictation", icon: "mic" }] },

  // Ticket #95 (map #35): the close checklist is always-on for every finance workspace and
  // has no retroactive back-fill — a workspace only starts having closes from the first
  // `openClose` call. The sign-off surface (#97) lives at /close and registers here.
  { key: "close", name: "Close checklist", description: "Monthly close: bank recon, AP aging, unposted accruals, and VAT workpaper.", industry: "finance", tier: "always", activation: "enable", navItems: [{ href: "close", label: "Close", icon: "check-circle" }] },

  { key: "ai-coding", name: "AI coding fallback", description: "When no supplier rule matches, AI suggests the coding with a confidence score; high-confidence suggestions keep documents touchless.", industry: "finance", tier: "default", activation: "enable" },
  { key: "data-health", name: "Data health", description: "Automated bookkeeping quality audits with source-document-linked findings.", industry: "finance", tier: "always", activation: "enable", navItems: [{ href: "health", label: "Health Checks", icon: "heart-pulse" }] },

  { key: "touchless-automation", name: "Touchless automation", description: "Auto-approve routine documents that pass confidence, policy, and budget checks.", industry: "finance", tier: "default", activation: "enable", navItems: [
    // Everything automation-related lives under this one destination — the page has its own
    // internal Metrics · Review queue · Vendors · Settings tabs (components/automation/automation-tabs.tsx),
    // so the sidebar doesn't need three parallel entries.
    // User-facing name is "Controls" — the accountant's own word for approvals, thresholds and
    // policies (internal controls). The route stays /automation: module keys, revalidatePaths and
    // external links all point there, and a label rename doesn't justify a URL migration.
    { href: "automation", label: "Controls", icon: "zap" },
  ] },
  { key: "policy-agent", name: "Policy agent", description: "AI policy evaluation against workspace rules before auto-approval.", industry: "finance", tier: "default", activation: "enable" },
  { key: "document-matching", name: "Document matching", description: "2/3-way PO-to-invoice-to-receipt matching with confidence scoring.", industry: "finance", tier: "default", activation: "enable" },
  { key: "budget-controls", name: "Budget controls", description: "Per-vendor and per-category spend budgets with threshold alerts.", industry: "finance", tier: "optional", activation: "enable", navItems: [{ href: "settings/budgets", label: "Budgets", icon: "wallet" }] },
]

export function findModule(key: string | null | undefined): ModuleDefinition | null {
  if (!key) return null
  return MODULES.find((module) => module.key === key) ?? null
}

/** Every module a workspace of this industry could ever have — core modules plus this industry's
 * own. A general workspace gets core only, since no rows below have industry "general". */
export function modulesForIndustry(industry: Industry): ModuleDefinition[] {
  return MODULES.filter((module) => module.industry === "core" || module.industry === industry)
}

export const INDUSTRIES: { key: Industry; label: string; description: string }[] = [
  { key: "finance", label: "Finance", description: "Bookkeeping and accounts payable: review, code, and push documents to your books." },
]

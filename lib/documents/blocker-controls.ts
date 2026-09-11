/** Maps a readiness-blocker `code` (from lib/readiness/evaluate.ts) to the Controls tab that owns
 * the lever that caused it. This is the connection between the two surfaces: a reviewer who lands
 * on a blocked document can click through to the exact place where the rule that stopped it lives.
 *
 * Some blockers deliberately have no link — a duplicate or a missing required field is a fact
 * about the document itself, not a control that was configured; sending the reviewer to a
 * settings tab there would be a bait-and-switch. Return null for those. */
export type BlockerControlTarget = {
  tab: "vendors" | "approvals" | "settings" | "matches" | "overview"
  label: string
}

export function blockerControlTarget(code: string): BlockerControlTarget | null {
  // Prefix matches first: low_confidence:<field>, missing_required_field:<field> — the codes carry
  // a field name after the colon but the lever is the same.
  if (code.startsWith("low_confidence:")) return { tab: "settings", label: "Controls · Settings" }
  if (code.startsWith("missing_required_field:")) return null

  switch (code) {
    case "check_warned":
    case "budget_exceeded":
    case "qa_sample":
    case "policy_violation":
    case "policy_error":
      return { tab: "settings", label: "Controls · Settings" }
    case "no_rule_match":
    case "ai_coding_unconfirmed":
      return { tab: "vendors", label: "Controls · Vendors" }
    case "supplier_cold_start":
      return { tab: "overview", label: "Controls · Supplier trust" }
    // Document-inherent: no lever to open. duplicate, check_failed, open_review_task,
    // business_rule_backstop, category_unconfirmed, not_pushable, no_extraction — these are all
    // "fix the document" rather than "loosen a rule".
    default:
      return null
  }
}

export function blockerControlHref(workspaceId: string, target: BlockerControlTarget): string {
  const base = `/workspaces/${workspaceId}/automation`
  switch (target.tab) {
    case "overview": return base
    case "vendors": return `${base}/vendors`
    case "approvals": return `${base}/approvals`
    case "matches": return `${base}/matches`
    case "settings": return `${base}/settings`
  }
}

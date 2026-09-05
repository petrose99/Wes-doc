/** Review task routing engine — pure, no Prisma.
 *
 * Given a document's attributes and a list of routing rules, finds the best matching rule
 * and returns the assignee. Rules are evaluated in priority order (highest first); the first
 * match wins. */

export type RoutingMatcher = {
  templateCode?: string | null
  vendorPattern?: string | null
  minAmount?: number | null
  maxAmount?: number | null
}

export type RoutingRule = {
  id: string
  name: string
  priority: number
  matcher: RoutingMatcher
  assigneeId: string
}

export type RoutingDocument = {
  templateCode: string | null
  vendor: string | null
  amount: number | null
}

export function findMatchingRule(rules: RoutingRule[], document: RoutingDocument): RoutingRule | null {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)

  for (const rule of sorted) {
    if (matchesRule(rule.matcher, document)) {
      return rule
    }
  }

  return null
}

export function matchesRule(matcher: RoutingMatcher, document: RoutingDocument): boolean {
  if (matcher.templateCode && matcher.templateCode !== document.templateCode) {
    return false
  }

  if (matcher.vendorPattern) {
    if (!document.vendor) return false
    try {
      const regex = new RegExp(matcher.vendorPattern, "i")
      if (!regex.test(document.vendor)) return false
    } catch {
      if (!document.vendor.toLowerCase().includes(matcher.vendorPattern.toLowerCase())) return false
    }
  }

  if (typeof matcher.minAmount === "number") {
    if (document.amount === null || document.amount < matcher.minAmount) return false
  }

  if (typeof matcher.maxAmount === "number") {
    if (document.amount === null || document.amount > matcher.maxAmount) return false
  }

  return true
}

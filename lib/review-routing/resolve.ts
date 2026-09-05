import { prisma } from "@/lib/db"
import { findMatchingRule, type RoutingDocument, type RoutingMatcher, type RoutingRule } from "./engine"

export async function resolveReviewAssignee(workspaceId: string, document: RoutingDocument): Promise<string | null> {
  const dbRules = await prisma.reviewRoutingRule.findMany({
    where: { workspaceId, isActive: true },
    select: { id: true, name: true, priority: true, matcher: true, assigneeId: true },
    orderBy: { priority: "desc" },
  })

  const rules: RoutingRule[] = dbRules.map((r: { id: string; name: string; priority: number; matcher: unknown; assigneeId: string }) => ({
    id: r.id,
    name: r.name,
    priority: r.priority,
    matcher: (r.matcher as RoutingMatcher) ?? {},
    assigneeId: r.assigneeId,
  }))

  const match = findMatchingRule(rules, document)
  return match?.assigneeId ?? null
}

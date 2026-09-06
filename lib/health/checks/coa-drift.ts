/** A7.4: Chart-of-accounts drift detector. An AccountingEntity cache row (WP1.5) may have been
 * synced when an account was active and named "6000 - Office Supplies"; the provider has since
 * archived or renamed it. Any CategoryAccountMapping still pointing at that row silently maps
 * documents to the wrong (or a dead) account. This check compares the cache's account rows
 * against the mappings that reference them and flags every drift. Warn — the fix is a manual
 * re-mapping decision, never automated. */
import type { CheckDefinition, CheckRunResult } from "@/lib/health/types"

export const coaDriftCheck: CheckDefinition = {
  code: "coa_drift",
  name: "Chart-of-accounts drift",
  category: "cleanup",
  defaultWeight: 1,
  requiresLedger: true,
  run: (ctx): CheckRunResult => {
    const mappings = ctx.ledger?.categoryMappings ?? []
    const accounts = new Map((ctx.ledger?.accountingEntities ?? [])
      .filter((entity) => entity.entityType === "account")
      .map((entity) => [entity.externalId, entity] as const))
    const findings: CheckRunResult["findings"] = []
    let checkedCount = 0
    for (const mapping of mappings) {
      checkedCount++
      const account = accounts.get(mapping.accountExternalId)
      if (!account) {
        findings.push({
          checkCode: "coa_drift", category: "cleanup", severity: "warning",
          title: `Category "${mapping.category}" points at a provider account that no longer syncs (id ${mapping.accountExternalId}).`,
          description: "The provider may have deleted or renamed the account since this mapping was configured. Documents in this category will fail push pre-flight until the mapping is fixed.",
          externalTransactionId: mapping.accountExternalId,
          suggestedAction: null,
          suggestedActionPayload: { mappingId: mapping.id, category: mapping.category },
          affectedCount: 1,
        })
        continue
      }
      if (!account.active) {
        findings.push({
          checkCode: "coa_drift", category: "cleanup", severity: "warning",
          title: `Category "${mapping.category}" maps to an archived account (${account.name}).`,
          description: `The account "${account.name}" is archived at the provider. New push attempts will bounce.`,
          externalTransactionId: account.externalId,
          suggestedAction: null,
          suggestedActionPayload: { mappingId: mapping.id, category: mapping.category, accountName: account.name },
          affectedCount: 1,
        })
      }
    }
    return { findings, applicableCount: checkedCount }
  },
}

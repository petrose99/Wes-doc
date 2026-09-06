/** A7.1: pre-flight validation of a push against the AccountingEntity cache (WP1.5's synced
 * snapshot of the provider's accounts/vendors/tax rates) — catches "this will bounce at the
 * provider" states BEFORE burning an attempt and, worse, before a half-created vendor: a push to
 * an archived expense account or a deactivated vendor fails closed into a review task instead.
 *
 * Pure. Deliberately conservative: it only ever blocks on evidence the cache actually holds —
 * an empty cache (sync never ran, or a provider we don't sync) waves everything through, and a
 * vendor with no cached row at all is fine (push-time findOrCreate will create it). */

export type PreflightEntity = {
  entityType: string
  externalId: string
  code: string | null
  name: string
  active: boolean
}

export type PreflightResult = { ok: true } | { ok: false; errorCode: string; message: string }

export function preflightPush(input: {
  expenseAccountId: string
  vendorName: string | null
  entities: PreflightEntity[]
}): PreflightResult {
  const accounts = input.entities.filter((entity) => entity.entityType === "account")
  if (accounts.length) {
    // QuickBooks addresses accounts by Id (externalId), Xero by Code — the configured
    // expenseAccountId may be either, so match both.
    const match = accounts.find((account) => account.externalId === input.expenseAccountId || (account.code !== null && account.code === input.expenseAccountId))
    if (!match) {
      return { ok: false, errorCode: "preflight_account_missing", message: `Expense account "${input.expenseAccountId}" is not in the synced chart of accounts — it may have been deleted or renamed at the provider.` }
    }
    if (!match.active) {
      return { ok: false, errorCode: "preflight_account_inactive", message: `Expense account "${match.name}" is archived/inactive at the provider.` }
    }
  }

  const vendorName = input.vendorName?.trim().toLowerCase()
  if (vendorName) {
    const vendors = input.entities.filter((entity) => entity.entityType === "vendor" && entity.name.trim().toLowerCase() === vendorName)
    // Only a problem when EVERY cached row for this exact name is inactive — an active duplicate
    // means push-time find-or-create will land on a live vendor.
    if (vendors.length && vendors.every((vendor) => !vendor.active)) {
      return { ok: false, errorCode: "preflight_vendor_inactive", message: `Vendor "${input.vendorName!.trim()}" exists at the provider but is deactivated — pushing would recreate or collide with it.` }
    }
  }

  return { ok: true }
}

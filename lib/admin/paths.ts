/** #231 Q9–Q10 (#252): every Admin address in one place, so the rail, the redirects from the
 * old Settings and Controls routes, and every in-app link agree. "Configuration" is one
 * destination with sections; each section is its own address so it deep-links. */
export const adminPaths = (workspaceId: string) => {
  const base = `/workspaces/${workspaceId}/admin`
  return {
    base,
    dashboard: `${base}/dashboard`,
    companies: `${base}/companies`,
    users: `${base}/users`,
    configuration: `${base}/configuration`,
    fields: `${base}/configuration`,
    autonomy: `${base}/configuration/autonomy`,
    checks: `${base}/configuration/checks`,
    report: `${base}/configuration/report`,
    intake: `${base}/configuration/intake`,
    tax: `${base}/configuration/tax`,
    payments: `${base}/configuration/payments`,
    whatsOn: `${base}/configuration/whats-on`,
    approvalFlows: `${base}/approval-flows`,
    poMismatchFlows: `${base}/po-mismatch-flows`,
    suppliers: `${base}/suppliers`,
    integrations: `${base}/integrations`,
  }
}

export const accountPaths = (workspaceId: string) => ({
  account: `/workspaces/${workspaceId}/account`,
  security: `/workspaces/${workspaceId}/account/security`,
})

/** The old Settings and Controls addresses and where each one lives now. Read by the redirect
 * stubs left at the old routes (308) so bookmarks and revalidatePaths keep landing. */
export function legacyAdminTarget(workspaceId: string, segment: string): string | null {
  const admin = adminPaths(workspaceId)
  const account = accountPaths(workspaceId)
  const map: Record<string, string> = {
    "settings/workspace": admin.users,
    "settings/modules": admin.whatsOn,
    "settings/rules": admin.suppliers,
    "settings/tax": admin.tax,
    "settings/categories": admin.tax,
    "settings/email": admin.intake,
    "settings/payments": admin.payments,
    "settings/templates": admin.whatsOn,
    "settings/reports": admin.whatsOn,
    "settings/integrations": admin.integrations,
    "settings/accounting-mapping": admin.integrations,
    "settings/security": account.security,
    "settings": admin.configuration,
    "automation": admin.report,
    "automation/settings": admin.autonomy,
    "automation/warn-checks": admin.checks,
    "automation/vendors": admin.suppliers,
    "automation/approvals": admin.approvalFlows,
    "automation/matches": admin.poMismatchFlows,
  }
  return map[segment] ?? null
}

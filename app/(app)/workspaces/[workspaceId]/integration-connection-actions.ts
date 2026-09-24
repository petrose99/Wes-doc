"use server"

/** Server actions for managing accounting connections (P2): listing, setting the default expense
 * account (which requires a live provider call to list accounts), and disconnecting. Same owner +
 * deployment + plan gate as app/(app)/workspaces/[workspaceId]/integrations-actions.ts, reused here
 * rather than duplicated. */

import { ActionState } from "@/lib/actions"
import { recordDocumentAudit } from "@/lib/audit"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { listExpenseAccounts as listQuickbooksAccounts } from "@/lib/integrations/quickbooks/client"
import { listExpenseAccounts as listXeroAccounts } from "@/lib/integrations/xero/client"
import { listBusinesses as listSageBusinesses } from "@/lib/integrations/sage/client"
import { syncAccountingEntities } from "@/lib/integrations/sync"
import { syncLedgerTransactions } from "@/lib/health/sync"
import {
  deleteWorkspaceIntegrationConnection,
  listWorkspaceIntegrationConnections,
  setWorkspaceIntegrationDefaultAccount,
  setWorkspaceIntegrationTenant,
  workspaceIntegrationsPlanEnabled,
} from "@/models/integrations"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { errorMessage, NO_ACCESS, paths, requireMember } from "./action-helpers"

async function guardIntegrations(workspaceId: string): Promise<{ userId: string } | { error: string }> {
  if (!config.integrations.enabled) return { error: "integrations_not_available" }
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { error: NO_ACCESS }
  if (!(await workspaceIntegrationsPlanEnabled(workspaceId))) return { error: "integrations_plan_required" }
  return { userId: user.id }
}

export async function listIntegrationConnectionsAction(workspaceId: string) {
  return listWorkspaceIntegrationConnections(workspaceId)
}

/** Fetches the live list of expense accounts from the provider (for the settings UI's default-
 * account <select>) — not cached, since the workspace's chart of accounts can change at the
 * provider at any time and this is only called when the owner opens the picker. */
export async function listExpenseAccountsAction(workspaceId: string, connectionId: string): Promise<ActionState<{ id: string; name: string }[]>> {
  const gate = await guardIntegrations(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  try {
    const connection = await prisma.integrationConnection.findFirst({
      where: { id: connectionId, workspaceId },
      select: { id: true, provider: true, externalTenantId: true },
    })
    if (!connection || !connection.externalTenantId) return { success: false, error: "That connection no longer exists" }
    let accounts: { id: string; name: string }[]
    switch (connection.provider) {
      case "quickbooks":
        accounts = await listQuickbooksAccounts(connection.externalTenantId, connection.id)
        break
      case "xero":
        accounts = (await listXeroAccounts(connection.externalTenantId, connection.id)).map((a) => ({ id: a.code, name: a.name }))
        break
      default:
        return { success: false, error: "Unsupported accounting provider" }
    }
    return { success: true, data: accounts }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not list expense accounts") }
  }
}

export async function setDefaultExpenseAccountAction(workspaceId: string, connectionId: string, accountId: string, accountName: string): Promise<ActionState> {
  const gate = await guardIntegrations(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  try {
    await setWorkspaceIntegrationDefaultAccount(workspaceId, connectionId, { id: accountId, name: accountName })
    await recordDocumentAudit({ workspaceId, actorId: gate.userId, type: "integration_default_account_changed", detail: { connectionId, accountId, accountName } })
    revalidatePath(paths(workspaceId).integrations)
    return { success: true }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not set the default expense account") }
  }
}

/** Manual re-sync of the connection's chart of accounts / vendors / tax rates into
 * AccountingEntity (WP1.5) — also run automatically once, right after the OAuth callback
 * completes (see the callback routes). */
export async function syncAccountingEntitiesAction(workspaceId: string, connectionId: string): Promise<ActionState> {
  const gate = await guardIntegrations(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  try {
    const connection = await prisma.integrationConnection.findFirst({ where: { id: connectionId, workspaceId }, select: { id: true } })
    if (!connection) return { success: false, error: "That connection no longer exists" }
    await syncAccountingEntities(connection.id)
    await recordDocumentAudit({ workspaceId, actorId: gate.userId, type: "integration_entities_synced", detail: { connectionId } })
    revalidatePath(paths(workspaceId).integrations)
    return { success: true }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not sync accounts") }
  }
}

/** Manual re-sync of the connection's bills/expenses/bank transactions into LedgerTransaction
 * (Phase B) — the ledger-side counterpart of syncAccountingEntitiesAction above. Reachable from
 * the Data Health page (next to "Run checks now"), since the ledger checks are what this data
 * actually feeds — see components/health/sync-ledger-button.tsx. */
export async function syncLedgerTransactionsAction(workspaceId: string, connectionId: string): Promise<ActionState<{ synced: number }>> {
  const gate = await guardIntegrations(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  try {
    const connection = await prisma.integrationConnection.findFirst({ where: { id: connectionId, workspaceId }, select: { id: true } })
    if (!connection) return { success: false, error: "That connection no longer exists" }
    const { synced } = await syncLedgerTransactions(connection.id)
    await recordDocumentAudit({ workspaceId, actorId: gate.userId, type: "integration_ledger_synced", detail: { connectionId, synced } })
    revalidatePath(`/workspaces/${workspaceId}/health`)
    return { success: true, data: { synced } }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not sync ledger transactions") }
  }
}

/** Sage's own in-page "Choose a business" step, right after auth (ADR 0005): Sage's OAuth grant
 * isn't scoped to one business, so unlike QuickBooks/Xero's `connection_config` tenant, the pick
 * happens here rather than off the AUTH webhook. An empty list is a named dead end, not an error —
 * the caller renders "create one in Sage first" rather than a retry. */
export async function listSageBusinessesAction(workspaceId: string, connectionId: string): Promise<ActionState<{ id: string; name: string }[]>> {
  const gate = await guardIntegrations(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  try {
    const connection = await prisma.integrationConnection.findFirst({ where: { id: connectionId, workspaceId, provider: "sage" }, select: { id: true } })
    if (!connection) return { success: false, error: "That connection no longer exists" }
    const businesses = await listSageBusinesses(connectionId)
    return { success: true, data: businesses }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not load Sage businesses") }
  }
}

export async function confirmSageBusinessAction(workspaceId: string, connectionId: string, businessId: string, businessName: string): Promise<ActionState> {
  const gate = await guardIntegrations(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  try {
    await setWorkspaceIntegrationTenant(workspaceId, connectionId, { externalTenantId: businessId, tenantName: businessName })
    await recordDocumentAudit({ workspaceId, actorId: gate.userId, type: "integration_tenant_selected", detail: { connectionId, businessId } })
    // #429: Sage has no tenant at Nango's `creation` webhook (ADR 0005), so this business pick is
    // its connect-completion path — chart sync (and the Default-account guess) happens here
    // instead of the webhook. A sync failure must not fail the business pick itself; the Default
    // row's surface shows the retry state.
    try {
      await syncAccountingEntities(connectionId)
    } catch {
      // left for the Default row's retry state.
    }
    revalidatePath(paths(workspaceId).integrations)
    return { success: true }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not confirm the business") }
  }
}

export async function disconnectIntegrationAction(workspaceId: string, connectionId: string): Promise<ActionState> {
  const gate = await guardIntegrations(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  try {
    await deleteWorkspaceIntegrationConnection(workspaceId, connectionId)
    await recordDocumentAudit({ workspaceId, actorId: gate.userId, type: "integration_disconnected", detail: { connectionId } })
    revalidatePath(paths(workspaceId).integrations)
    return { success: true }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not disconnect") }
  }
}

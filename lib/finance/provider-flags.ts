import config from "@/lib/config"

/** Whether any accounting connector is configured on this deployment — drives the rail's Finance
 * entry and the phone tab bar's Finance tab. Deployment-level only (same semantics as each
 * individual `enabled` flag): says nothing about whether any *workspace* has actually connected a
 * provider. #329 widens this from Bigcapital-only to an OR across all three connectors. */
export function anyAccountingProviderEnabled(): boolean {
  return config.integrations.bigcapital.enabled || config.integrations.xero.enabled || config.integrations.quickbooks.enabled
}

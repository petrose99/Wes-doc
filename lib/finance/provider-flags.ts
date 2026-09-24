import config from "@/lib/config"

/** Whether any accounting connector is configured on this deployment — drives the rail's Finance
 * entry and the phone tab bar's Finance tab. Deployment-level only: says nothing about whether any
 * *workspace* has actually connected a provider. Per ADR 0005, Nango owns QuickBooks, Xero and
 * Sage alike, so one deployment-level gate covers all three — which providerConfigKeys Nango has
 * configured on its own side is Nango's concern, not something DocuBite flags per-provider. */
export function anyAccountingProviderEnabled(): boolean {
  return config.integrations.nango.enabled
}

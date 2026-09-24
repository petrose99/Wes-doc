import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { createConnectSession } from "@/lib/nango"
import { workspaceIntegrationsPlanEnabled } from "@/models/integrations"
import { requireWorkspaceRole } from "@/models/workspaces"
import { NextRequest, NextResponse } from "next/server"

/** ADR 0005 step 4: the one provider-agnostic replacement for the four retired
 * `{quickbooks,xero}/{connect,callback}` routes. Owner-only, plan-gated, same checks those routes
 * ran — mints a Nango Connect session scoped to exactly one `providerConfigKey` (`allowed_integrations`
 * in lib/nango.ts) for the frontend's `nango.auth()` call (#383's build, not this one). The AUTH
 * webhook (app/api/webhooks/nango/route.ts), not this route's response, is what marks a connection
 * `connected` — this route never touches IntegrationConnection. */
const KNOWN_PROVIDERS = new Set(["quickbooks", "xero", "sage"])

export async function POST(request: NextRequest) {
  if (!config.integrations.nango.enabled) return new Response("Accounting connections aren't configured on this deployment", { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }
  const { workspaceId, providerConfigKey } = (body ?? {}) as { workspaceId?: unknown; providerConfigKey?: unknown }
  if (typeof workspaceId !== "string" || !workspaceId) return new Response("Missing workspaceId", { status: 400 })
  if (typeof providerConfigKey !== "string" || !KNOWN_PROVIDERS.has(providerConfigKey)) return new Response("Missing or unknown providerConfigKey", { status: 400 })

  const user = await getCurrentUser()
  try {
    await requireWorkspaceRole(workspaceId, user.id, ["owner"])
  } catch {
    return new Response("Only owners can connect an accounting provider", { status: 403 })
  }
  if (!(await workspaceIntegrationsPlanEnabled(workspaceId))) {
    return new Response("Integrations are available on a paid plan", { status: 403 })
  }

  try {
    const session = await createConnectSession({ endUserId: workspaceId, providerConfigKey })
    return NextResponse.json(session)
  } catch {
    return new Response("Could not start the connection — please try again", { status: 502 })
  }
}

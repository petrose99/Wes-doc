import { AddAllowedSenderForm, InboundEmailAddress, RemoveAllowedSenderButton } from "@/components/settings/inbound-email-settings"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import config from "@/lib/config"
import { getCurrentUser } from "@/lib/auth"
import { ensureInboundEmailToken, listAllowedSenders, listRecentIntakes } from "@/models/inbound-email"
import { requireWorkspaceRole } from "@/models/workspaces"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

/** The outcomes processInboundEmail records, in the words someone who just sent a mail would use.
 * "ingested" is the only one that puts a document in the pipeline; the other three all look the
 * same from a mail client (delivered, no bounce, nothing appears), which is exactly why they are
 * spelled out rather than shown as a status code. */
const INTAKE_OUTCOMES: Record<string, { label: string; hint: string; className: string }> = {
  ingested: { label: "Added", hint: "Extracted into the pipeline", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  duplicate: { label: "Already had it", hint: "The same attachment was received before, so nothing new was created", className: "bg-slate-100 text-slate-600 border-slate-200" },
  no_document: { label: "Nothing to extract", hint: "No attachment this workspace could read", className: "bg-amber-50 text-amber-700 border-amber-200" },
  sender_rejected: { label: "Sender not allowed", hint: "Add the address under Allowed senders to accept it", className: "bg-red-50 text-red-700 border-red-200" },
}

function IntakeOutcome({ outcome, acceptedCount }: { outcome: string; acceptedCount: number }) {
  const spec = INTAKE_OUTCOMES[outcome]
  if (!spec) return <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">{outcome}</span>
  return <span title={spec.hint} className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${spec.className}`}>
    {spec.label}{outcome === "ingested" && acceptedCount > 1 ? ` (${acceptedCount})` : ""}
  </span>
}

/** WP1.4: surfaces the inbound-email address (previously dark — no UI existed even though the
 * route and token were built) and lets an owner widen the sender allowlist beyond "already a
 * workspace member". Not available for a healthcare workspace — see models/inbound-email.ts on
 * why unencrypted email is not an acceptable ePHI channel. */
export default async function InboundEmailSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const owner = membership.role === "owner"

  let token: string | null = null
  try {
    token = await ensureInboundEmailToken(workspaceId)
  } catch {
    notFound()
  }
  const senders = await listAllowedSenders(workspaceId)
  const intakes = await listRecentIntakes(workspaceId)

  return <main className="space-y-6">
    <header>
      <h1 className="text-3xl font-bold">Email intake</h1>
      <p className="mt-1 text-muted-foreground">Forward or CC documents to this address and they&apos;ll be ingested the same way as an upload.</p>
    </header>

    <Card>
      <CardHeader>
        <CardTitle>Your inbound address</CardTitle>
        <CardDescription>{config.inboundEmail.enabled ? "Only mail from an allowed sender below is accepted." : "Not yet active on this deployment — the address is reserved for when it is."}</CardDescription>
      </CardHeader>
      <CardContent>
        <InboundEmailAddress address={`${token}@${config.inboundEmail.domain}`} />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Recent mail</CardTitle>
        <CardDescription>What happened to each message sent to the address above. A mail that was already held, refused, or carried nothing to extract looks identical from the sender&apos;s side — no bounce, nothing new in the pipeline — so this is where the difference shows.</CardDescription>
      </CardHeader>
      <CardContent>
        {!intakes.length
          ? <p className="text-sm text-slate-500">No mail received yet.</p>
          : <ul className="divide-y text-sm">
              {intakes.map((intake) => <li key={intake.id} className="flex items-start justify-between gap-4 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{intake.subject?.trim() || "(no subject)"}</p>
                  <p className="truncate text-xs text-slate-500">
                    {intake.fromAddress} · {intake.createdAt.toLocaleString()}
                    {intake.attachmentCount > 0 && ` · ${intake.attachmentCount} attachment${intake.attachmentCount === 1 ? "" : "s"}`}
                  </p>
                </div>
                <IntakeOutcome outcome={intake.outcome} acceptedCount={intake.acceptedCount} />
              </li>)}
            </ul>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Allowed senders</CardTitle>
        <CardDescription>Every workspace member can already send. Add another address or a whole domain (e.g. @yourfirm.com) to widen that.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {owner && <AddAllowedSenderForm workspaceId={workspaceId} />}
        {!senders.length
          ? <p className="text-sm text-slate-500">No additional senders allowed yet.</p>
          : <ul className="divide-y">
              {senders.map((sender) => <li key={sender.id} className="flex items-center justify-between py-2 text-sm">
                <span>{sender.pattern}</span>
                {owner && <RemoveAllowedSenderButton workspaceId={workspaceId} id={sender.id} />}
              </li>)}
            </ul>}
      </CardContent>
    </Card>
  </main>
}

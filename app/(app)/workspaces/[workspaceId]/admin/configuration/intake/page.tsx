import { AdminPage, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Empty, Panel } from "@/components/automation/automation-ui"
import { AddAllowedSenderForm, InboundEmailAddress, RemoveAllowedSenderButton } from "@/components/settings/inbound-email-settings"
import { WorkspaceAiToggle } from "@/components/workspace/ai-toggle"
import { getAdminContext } from "@/lib/admin/context"
import config from "@/lib/config"
import { ensureInboundEmailToken, listAllowedSenders, listRecentIntakes } from "@/models/inbound-email"

export const dynamic = "force-dynamic"

/** The outcomes processInboundEmail records, in the words someone who just sent a mail would
 * use. Only "Added" puts a document in a queue; the other three look identical from a mail
 * client (delivered, no bounce, nothing appears), which is why each is spelled out. */
const INTAKE_OUTCOMES: Record<string, { label: string; hint: string; className: string }> = {
  ingested: { label: "Added", hint: "Extracted into a queue", className: "bg-emerald-50 text-emerald-800" },
  duplicate: { label: "Already had it", hint: "The same attachment was received before, so nothing new was created", className: "bg-slate-100 text-slate-700" },
  no_document: { label: "Nothing to extract", hint: "No attachment this company could read", className: "bg-amber-50 text-amber-800" },
  sender_rejected: { label: "Sender not allowed", hint: "Add the address under Allowed senders to accept it", className: "bg-red-50 text-red-800" },
}

function IntakeOutcome({ outcome, acceptedCount }: { outcome: string; acceptedCount: number }) {
  const spec = INTAKE_OUTCOMES[outcome]
  if (!spec) return <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{outcome}</span>
  return <span className="shrink-0">
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${spec.className}`}>{spec.label}{outcome === "ingested" && acceptedCount > 1 ? ` (${acceptedCount})` : ""}</span>
    <span className="sr-only"> — {spec.hint}</span>
  </span>
}

const dateTime = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" })

/** #231 Q10 (#252): Admin › Configuration › Intake — the two ways documents arrive without a
 * person uploading them: AI extraction on what arrives, and the inbound email address. */
export default async function IntakePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const readOnly = !context.owner

  let token: string | null = null
  try { token = await ensureInboundEmailToken(workspaceId) } catch { token = null }
  const [senders, intakes] = token ? await Promise.all([listAllowedSenders(workspaceId), listRecentIntakes(workspaceId)]) : [[], []]

  return <AdminPage title="Intake" intro="How documents get into this company's queues without a person uploading them.">
    {readOnly && <ReadOnlyBand owners={context.owners} />}

    <Panel title="AI extraction">
      <WorkspaceAiToggle workspaceId={workspaceId} enabled={context.workspace.aiEnabled} readOnly={readOnly} />
    </Panel>

    {token === null
      ? <Panel title="Email intake" note="Email intake is not available for this company: a healthcare company never receives documents over unencrypted email.">{null}</Panel>
      : <>
        <Panel title="Email intake" note={config.inboundEmail.enabled
          ? "Forward or CC documents to this address and they arrive in the queue their type belongs to, the same way as an upload. Only mail from an allowed sender is accepted."
          : "Not yet active on this deployment — the address is reserved for when it is."}>
          <InboundEmailAddress address={`${token}@${config.inboundEmail.domain}`} />
        </Panel>

        <Panel title="Recent mail" note="What happened to each message sent to the address. A mail that was already held, refused, or carried nothing to extract looks identical from the sender's side — no bounce, nothing new — so this is where the difference shows.">
          {!intakes.length
            ? <Empty title="No mail received yet">The first message to the address above shows up here with what happened to it.</Empty>
            : <ul className="divide-y divide-hairline-soft text-sm">
                {intakes.map((intake) => <li key={intake.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{intake.subject?.trim() || "(no subject)"}</p>
                    <p className="truncate text-xs text-slate-500">
                      {intake.fromAddress} · {dateTime.format(intake.createdAt)}
                      {intake.attachmentCount > 0 && ` · ${intake.attachmentCount} attachment${intake.attachmentCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <IntakeOutcome outcome={intake.outcome} acceptedCount={intake.acceptedCount} />
                </li>)}
              </ul>}
        </Panel>

        <Panel title="Allowed senders" note="Every member can already send. Add another address or a whole domain (for example @yourfirm.com) to widen that.">
          <div className="space-y-4">
            {!readOnly && <AddAllowedSenderForm workspaceId={workspaceId} />}
            {!senders.length
              ? <p className="text-sm text-slate-600">No additional senders yet — members&rsquo; own addresses are always accepted.</p>
              : <ul className="divide-y divide-hairline-soft">
                  {senders.map((sender) => <li key={sender.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-900">{sender.pattern}</span>
                    {!readOnly && <RemoveAllowedSenderButton workspaceId={workspaceId} id={sender.id} />}
                  </li>)}
                </ul>}
          </div>
        </Panel>
      </>}
  </AdminPage>
}

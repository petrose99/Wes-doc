import { AdminPage, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Empty, Panel } from "@/components/automation/automation-ui"
import { AddAllowedSenderForm, InboundEmailAddress, RemoveAllowedSenderButton } from "@/components/settings/inbound-email-settings"
import { AddWhatsAppSenderForm, RemoveWhatsAppSenderButton, ShareWhatsAppNumber } from "@/components/settings/whatsapp-settings"
import { WorkspaceAiToggle } from "@/components/workspace/ai-toggle"
import { getAdminContext } from "@/lib/admin/context"
import config from "@/lib/config"
import { ensureInboundEmailToken, listAllowedSenders, listRecentIntakes } from "@/models/inbound-email"
import { listAllowedSenders as listWhatsAppAllowedSenders, listRecentIntakes as listWhatsAppRecentIntakes } from "@/models/inbound-whatsapp"

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

/// #372: WhatsAppIntake's outcomes — mirrors INTAKE_OUTCOMES above. "sender_unknown" and
/// "sender_ambiguous" never appear here: those rows carry no workspaceId (see
/// models/inbound-whatsapp.ts's listRecentIntakes comment), so they exist only in the platform
/// audit trail, not on any one company's log — they aren't this company's problem until an admin
/// links the number.
const WHATSAPP_OUTCOMES: Record<string, { label: string; hint: string; className: string }> = {
  ingested: { label: "Added", hint: "Extracted into Receipts", className: "bg-emerald-50 text-emerald-800" },
  no_document: { label: "Nothing to extract", hint: "The photo or file couldn't be read", className: "bg-amber-50 text-amber-800" },
}

function WhatsAppOutcome({ outcome, acceptedCount }: { outcome: string; acceptedCount: number }) {
  const spec = WHATSAPP_OUTCOMES[outcome]
  if (!spec) return <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{outcome}</span>
  return <span className="shrink-0">
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${spec.className}`}>{spec.label}{outcome === "ingested" && acceptedCount > 1 ? ` (${acceptedCount})` : ""}</span>
    <span className="sr-only"> — {spec.hint}</span>
  </span>
}

/** #231 Q10 (#252): Admin › Configuration › Intake — the two ways documents arrive without a
 * person uploading them: AI extraction on what arrives, and the inbound email address. */
export default async function IntakePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const readOnly = !context.owner

  let token: string | null = null
  try { token = await ensureInboundEmailToken(workspaceId) } catch { token = null }
  const [senders, intakes] = token ? await Promise.all([listAllowedSenders(workspaceId), listRecentIntakes(workspaceId)]) : [[], []]

  const [whatsappSenders, whatsappIntakes] = config.whatsapp.enabled
    ? await Promise.all([listWhatsAppAllowedSenders(workspaceId), listWhatsAppRecentIntakes(workspaceId)])
    : [[], []]
  const memberOptions = context.members.map((member) => ({ id: member.id, name: member.user.name || member.user.email }))

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

    {config.whatsapp.enabled && config.whatsapp.businessNumber && <>
      <Panel title="WhatsApp intake" note="Inbound only — nothing is ever sent from DocuBite. A client or employee photographs a receipt and sends it to this number; it arrives in Receipts the same way an upload does.">
        <ShareWhatsAppNumber number={config.whatsapp.businessNumber} companyName={context.workspace.name} />
      </Panel>

      <Panel title="Recent WhatsApp messages" note="What happened to each message sent to the number above.">
        {!whatsappIntakes.length
          ? <Empty title="No messages received yet">The first message to the number above shows up here with what happened to it.</Empty>
          : <ul className="divide-y divide-hairline-soft text-sm">
              {whatsappIntakes.map((intake) => <li key={intake.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{intake.caption?.trim() || "(no caption)"}</p>
                  <p className="truncate text-xs text-slate-500">
                    {intake.fromNumber} · {dateTime.format(intake.createdAt)}
                    {intake.attachmentCount > 0 && ` · ${intake.attachmentCount} attachment${intake.attachmentCount === 1 ? "" : "s"}`}
                  </p>
                </div>
                <WhatsAppOutcome outcome={intake.outcome} acceptedCount={intake.acceptedCount} />
              </li>)}
            </ul>}
      </Panel>

      <Panel title="Allowed senders" note="Every number a client or employee sends from must be added here first. Link a number to a member so their receipts land in that person's expense claim; leave a client's number unlinked.">
        <div className="space-y-4">
          {!readOnly && <AddWhatsAppSenderForm workspaceId={workspaceId} members={memberOptions} />}
          {!whatsappSenders.length
            ? <p className="text-sm text-slate-600">No numbers added yet.</p>
            : <ul className="divide-y divide-hairline-soft">
                {whatsappSenders.map((sender) => <li key={sender.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-900">{sender.label} <span className="text-slate-500">· {sender.phoneNumber}</span></span>
                  {!readOnly && <RemoveWhatsAppSenderButton workspaceId={workspaceId} id={sender.id} />}
                </li>)}
              </ul>}
        </div>
      </Panel>
    </>}
  </AdminPage>
}

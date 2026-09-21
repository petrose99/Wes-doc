"use client"

import { addWhatsAppSenderAction, removeWhatsAppSenderAction } from "@/app/(app)/workspaces/[workspaceId]/whatsapp-actions"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** #372: the sentence an admin copies and sends the client/employee themselves, from their own
 * phone — nothing is ever initiated by DocuBite. */
function shareSentence(companyName: string, number: string): string {
  return `Send your receipts to ${companyName} on WhatsApp: ${number} — one photo per slip.`
}

export function ShareWhatsAppNumber({ number, companyName }: { number: string; companyName: string }) {
  const [copiedNumber, setCopiedNumber] = useState(false)
  const [copiedSentence, setCopiedSentence] = useState(false)

  const copy = async (text: string, mark: (value: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text)
      mark(true)
      setTimeout(() => mark(false), 1500)
    } catch { toast.error("Could not copy to clipboard") }
  }

  return <div className="space-y-2">
    <div className="flex items-center gap-2">
      <code className="rounded bg-slate-100 px-2 py-1 text-sm">{number}</code>
      <button type="button" onClick={() => void copy(number, setCopiedNumber)} className="text-xs font-medium text-emerald-700 hover:underline">{copiedNumber ? "Copied" : "Copy number"}</button>
    </div>
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => void copy(shareSentence(companyName, number), setCopiedSentence)} className="rounded-md border px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
        {copiedSentence ? "Copied" : "Share this number"}
      </button>
      <span className="text-xs text-slate-500">Copies a ready message to send from your own phone.</span>
    </div>
  </div>
}

export function AddWhatsAppSenderForm({ workspaceId, members }: { workspaceId: string; members: { id: string; name: string }[] }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const submit = async (formData: FormData) => {
    setPending(true)
    try {
      const result = await addWhatsAppSenderAction(workspaceId, formData)
      if (!result.success) { toast.error(result.error || "Could not add that sender"); return }
      toast.success("Sender added")
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }

  return <form action={submit} className="flex flex-wrap items-end gap-2">
    <div>
      <label className="block text-xs font-medium text-slate-500">Phone number</label>
      <input name="phoneNumber" required className="mt-1 w-40 rounded-md border px-2.5 py-1.5 text-sm" placeholder="+266 6123 4567" />
    </div>
    <div className="flex-1">
      <label className="block text-xs font-medium text-slate-500">Name</label>
      <input name="label" required className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm" placeholder="Katse Office Supply" />
    </div>
    <div>
      <label className="block text-xs font-medium text-slate-500">Linked member</label>
      <select name="linkedMemberId" className="mt-1 w-48 rounded-md border px-2.5 py-1.5 text-sm" defaultValue="">
        <option value="">Client — no login</option>
        {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
    </div>
    <button type="submit" disabled={pending} className="rounded-md bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Add</button>
  </form>
}

export function RemoveWhatsAppSenderButton({ workspaceId, id }: { workspaceId: string; id: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const remove = async () => {
    setPending(true)
    try {
      const result = await removeWhatsAppSenderAction(workspaceId, id)
      if (!result.success) { toast.error(result.error || "Could not remove that sender"); return }
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }

  return <button type="button" disabled={pending} onClick={() => void remove()} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">Remove</button>
}

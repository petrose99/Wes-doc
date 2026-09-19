"use client"

import { submitDemoRequest } from "@/app/(marketing)/demo/actions"
import { VOLUME_OPTIONS } from "@/app/(marketing)/demo/volume-options"
import { FormError } from "@/components/forms/error"
import { track } from "@/lib/analytics"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { CheckCircle2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

/** Mirrors the zod schema in `demo/actions.ts` so a mistake is named beside the field that caused it
 * instead of arriving as one line under the button after a round trip. The server stays the
 * authority — this only moves the same three rules earlier. Keep the two in step. */
const RULES = {
  name: (value: string) => (value.trim().length < 2 ? "Please give us a name we can use" : null),
  email: (value: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : "That does not look like an email address"),
  company: (value: string) => (value.trim().length < 2 ? "Please tell us where you work" : null),
} as const

type FieldName = keyof typeof RULES

function Field({ label, name, error, children, hint }: { label: string; name?: string; error?: string; children: React.ReactNode; hint?: string }) {
  return <label className="flex flex-col gap-1.5">
    <span className="text-sm font-medium text-slate-800">{label}</span>
    {children}
    {error && <span id={`${name}-error`} className="text-sm font-medium text-red-700">{error}</span>}
    {hint && <span className="text-xs text-slate-600">{hint}</span>}
  </label>
}

export function DemoForm() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({})

  if (sent) {
    return (
      <div className="rounded-[2rem] rounded-tr-md border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-700" strokeWidth={1.6} />
        <h2 className="mt-4 font-display text-2xl font-bold tracking-[-0.02em] text-slate-900">Request received</h2>
        <p className="mx-auto mt-2 max-w-sm leading-7 text-slate-600">
          A person reads this, not a sequencer. We will reply from the support inbox within one business day to find a
          time — bring a real document you would like to discuss.
        </p>
      </div>
    )
  }

  /* Validate on blur, never while typing: an error that appears on the third keystroke of an email
     address is telling the user they are wrong before they have finished being right. */
  const validateField = (field: FieldName, value: string) =>
    setFieldErrors((previous) => ({ ...previous, [field]: RULES[field](value) ?? undefined }))

  const clearField = (field: FieldName) => setFieldErrors((previous) => ({ ...previous, [field]: undefined }))

  const fieldProps = (field: FieldName) => ({
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => validateField(field, event.target.value),
    onChange: () => fieldErrors[field] && clearField(field),
    "aria-invalid": Boolean(fieldErrors[field]),
    "aria-describedby": fieldErrors[field] ? `${field}-error` : undefined,
  })

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)

    const found = Object.fromEntries(
      (Object.keys(RULES) as FieldName[])
        .map((field) => [field, RULES[field](String(data.get(field) || ""))])
        .filter(([, message]) => message)
    ) as Partial<Record<FieldName, string>>
    if (Object.keys(found).length) {
      setFieldErrors(found)
      return
    }

    setBusy(true)
    setError(null)
    try {
      const result = await submitDemoRequest(data)
      if (!result.ok) {
        setError(result.error)
        return
      }
      track("demo_requested", { volume: String(data.get("volume") ?? "") })
      setSent(true)
      toast.success("Demo request sent — we will be in touch shortly")
    } catch {
      setError("Something went wrong sending that. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-[2rem] rounded-tr-md bg-white p-6 shadow-[0_28px_70px_-48px_rgba(41,37,36,.5)] sm:p-8">
      <Field label="Your name" name="name" error={fieldErrors.name}>
        <Input name="name" required autoComplete="name" placeholder="Alex Moreau" {...fieldProps("name")} />
      </Field>
      <Field label="Work email" name="email" error={fieldErrors.email}>
        <Input name="email" type="email" required autoComplete="email" placeholder="alex@yourfirm.com" {...fieldProps("email")} />
      </Field>
      <Field label="Company" name="company" error={fieldErrors.company}>
        <Input name="company" required autoComplete="organization" placeholder="Moreau &amp; Co Bookkeeping" {...fieldProps("company")} />
      </Field>
      <Field label="Monthly document volume">
        <NativeSelect name="volume" defaultValue={VOLUME_OPTIONS[1]} className="w-full">
          {VOLUME_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Anything we should look at?" hint="Optional — the document type that gives you the most trouble is the most useful thing to tell us.">
        <Textarea name="message" rows={4} placeholder="We process about 400 supplier invoices a month…" />
      </Field>

      {/* Honeypot: hidden from people, filled in by bots. See submitDemoRequest. */}
      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-700 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Request a demo"}
      </button>

      {error && <FormError>{error}</FormError>}
    </form>
  )
}

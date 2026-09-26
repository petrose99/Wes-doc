"use client"

import { createInitialWorkspaceAction } from "@/app/(app)/workspaces/new/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CompanyCountryCurrencyFields } from "@/components/workspace/company-country-currency-fields"
import { defaultCurrency, personalCountry } from "@/lib/geo/company-currency"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

const FISCAL_MONTHS = [
  { value: "january", label: "January" }, { value: "february", label: "February" },
  { value: "march", label: "March" }, { value: "april", label: "April" },
  { value: "may", label: "May" }, { value: "june", label: "June" },
  { value: "july", label: "July" }, { value: "august", label: "August" },
  { value: "september", label: "September" }, { value: "october", label: "October" },
  { value: "november", label: "November" }, { value: "december", label: "December" },
]

/** Public geoip endpoint used only if the server didn't already know the country from an edge-
 * proxy header. CORS-permissive, no API key, returns `{ country: "US", ... }`. A failure — offline,
 * blocked, rate-limited — silently leaves the form's own default in place. */
const GEOIP_URL = "https://get.geojs.io/v1/ip/country.json"

export function NewWorkspaceForm({ defaultName, initialCountry }: {
  defaultName: string
  /** Two-letter country code the server derived from the request's edge headers (Cloudflare's
   * cf-ipcountry etc.). Null when the deployment isn't behind a proxy that stamps it — the form
   * then falls back to a client-side IP lookup. */
  initialCountry?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // #457: Lesotho or South Africa only — the detected country when it is one of them, else South
  // Africa; changing the country resets the Company currency to the country's own.
  const seeded = personalCountry(initialCountry)
  const [company, setCompany] = useState<{ country: string; currency: string }>({ country: seeded, currency: defaultCurrency(seeded)! })
  const [timezone, setTimezone] = useState("UTC")

  useEffect(() => {
    try { setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone) } catch {}
  }, [])

  useEffect(() => {
    // Skip the client-side lookup when the server already told us the country from a proxy header.
    if (initialCountry) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(GEOIP_URL, { cache: "no-store" })
        if (!res.ok) return
        const data: { country?: string } = await res.json()
        const code = data.country?.toUpperCase()
        if (cancelled || !code || !/^[A-Z]{2}$/.test(code)) return
        const detected = personalCountry(code)
        setCompany({ country: detected, currency: defaultCurrency(detected)! })
      } catch { /* offline / blocked / rate-limited — keep the form's own default */ }
    })()
    return () => { cancelled = true }
  }, [initialCountry])

  return <form className="space-y-6" action={(formData) => startTransition(async () => {
    const result = await createInitialWorkspaceAction({
      name: String(formData.get("name") || ""),
      country: String(formData.get("country") || ""),
      baseCurrency: String(formData.get("baseCurrency") || ""),
      timezone: String(formData.get("timezone") || "UTC"),
      fiscalYearStart: String(formData.get("fiscalYearStart") || "january"),
    })
    if (!result.success || !result.data) { setError(result.error || "Could not set up your company"); return }
    router.push(`/workspaces/${result.data.workspaceId}`)
  })}>
    <div className="mx-auto grid max-w-md gap-4">
      <div>
        <label htmlFor="ws-name" className="mb-1.5 block text-sm font-medium text-slate-700">Organization name</label>
        <Input id="ws-name" name="name" defaultValue={defaultName} required />
      </div>

      <CompanyCountryCurrencyFields idPrefix="ws" country={company.country} currency={company.currency}
        onChange={(value) => setCompany(value)}
        labelClassName="mb-1.5 block text-sm font-medium text-slate-700"
        selectClassName="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ws-fiscal" className="mb-1.5 block text-sm font-medium text-slate-700">Fiscal year starts</label>
          <select id="ws-fiscal" name="fiscalYearStart" defaultValue="january" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
            {FISCAL_MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="ws-tz" className="mb-1.5 block text-sm font-medium text-slate-700">Time zone</label>
          <Input id="ws-tz" name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Setting up…" : "Continue"}</Button>
    </div>

    {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
  </form>
}

"use client"

import { createInitialWorkspaceAction } from "@/app/(app)/workspaces/new/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useState, useTransition, useEffect } from "react"

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "ZA", label: "South Africa" },
  { value: "LS", label: "Lesotho" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "IN", label: "India" },
  { value: "BR", label: "Brazil" },
  { value: "JP", label: "Japan" },
  { value: "NG", label: "Nigeria" },
  { value: "KE", label: "Kenya" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "SG", label: "Singapore" },
  { value: "NL", label: "Netherlands" },
  { value: "CH", label: "Switzerland" },
  { value: "NZ", label: "New Zealand" },
  { value: "IE", label: "Ireland" },
  { value: "SE", label: "Sweden" },
  { value: "MX", label: "Mexico" },
]

const CURRENCIES = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "ZAR", label: "ZAR — South African Rand" },
  { value: "LSL", label: "LSL — Lesotho Loti" },
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "BRL", label: "BRL — Brazilian Real" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "NGN", label: "NGN — Nigerian Naira" },
  { value: "KES", label: "KES — Kenyan Shilling" },
  { value: "AED", label: "AED — UAE Dirham" },
  { value: "SGD", label: "SGD — Singapore Dollar" },
  { value: "CHF", label: "CHF — Swiss Franc" },
  { value: "NZD", label: "NZD — New Zealand Dollar" },
  { value: "SEK", label: "SEK — Swedish Krona" },
  { value: "MXN", label: "MXN — Mexican Peso" },
]

const FISCAL_MONTHS = [
  { value: "january", label: "January" },
  { value: "february", label: "February" },
  { value: "march", label: "March" },
  { value: "april", label: "April" },
  { value: "may", label: "May" },
  { value: "june", label: "June" },
  { value: "july", label: "July" },
  { value: "august", label: "August" },
  { value: "september", label: "September" },
  { value: "october", label: "October" },
  { value: "november", label: "November" },
  { value: "december", label: "December" },
]

export function NewWorkspaceForm({ defaultName }: { defaultName: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [timezone, setTimezone] = useState("UTC")

  useEffect(() => {
    try { setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone) } catch {}
  }, [])

  return <form className="space-y-6" action={(formData) => startTransition(async () => {
    const result = await createInitialWorkspaceAction({
      name: String(formData.get("name") || ""),
      country: String(formData.get("country") || "US"),
      baseCurrency: String(formData.get("baseCurrency") || "USD"),
      timezone: String(formData.get("timezone") || "UTC"),
      fiscalYearStart: String(formData.get("fiscalYearStart") || "january"),
    })
    if (!result.success || !result.data) { setError(result.error || "Could not set up your workspace"); return }
    router.push(`/workspaces/${result.data.workspaceId}`)
  })}>
    <div className="mx-auto grid max-w-md gap-4">
      <div>
        <label htmlFor="ws-name" className="mb-1.5 block text-sm font-medium text-slate-700">Organization name</label>
        <Input id="ws-name" name="name" defaultValue={defaultName} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ws-country" className="mb-1.5 block text-sm font-medium text-slate-700">Country</label>
          <select id="ws-country" name="country" defaultValue="US" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
            {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="ws-currency" className="mb-1.5 block text-sm font-medium text-slate-700">Base currency</label>
          <select id="ws-currency" name="baseCurrency" defaultValue="USD" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
            {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

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

    {error && <p className="text-center text-sm text-destructive">{error}</p>}
  </form>
}

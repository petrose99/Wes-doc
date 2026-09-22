"use client"

import { createInitialWorkspaceAction } from "@/app/(app)/workspaces/new/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { currencyForCountry } from "@/lib/geo/country-currency"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"

/** Every ISO 3166-1 alpha-2 region + its Intl display name, alphabetised. Built at module load
 * from Intl's own tables so the form covers every country the platform recognises without a
 * hand-maintained list drifting out of date. Falls back to a small hard-coded set if the runtime
 * doesn't expose `Intl.supportedValuesOf` (very old browsers). */
function buildCountryList(): { value: string; label: string }[] {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" })
    // "region" is supported at runtime (ES2023+) but TS's lib.d.ts still restricts the literal
    // union to the older values — the cast unblocks that without changing behaviour, and the try
    // block catches any runtime rejection on an older engine.
    return (Intl.supportedValuesOf as (key: string) => string[])("region")
      .filter((code) => /^[A-Z]{2}$/.test(code))
      .map((code) => ({ value: code, label: names.of(code) ?? code }))
      .sort((a, b) => a.label.localeCompare(b.label))
  } catch {
    return [
      { value: "US", label: "United States" }, { value: "GB", label: "United Kingdom" },
      { value: "CA", label: "Canada" }, { value: "AU", label: "Australia" },
      { value: "DE", label: "Germany" }, { value: "FR", label: "France" },
      { value: "IN", label: "India" }, { value: "JP", label: "Japan" },
      { value: "BR", label: "Brazil" }, { value: "ZA", label: "South Africa" },
    ]
  }
}

/** Every ISO 4217 currency + its Intl display name, alphabetised by code. Same story as the
 * country list — sourced from Intl so the dropdown stays complete without a hand-maintained
 * catalogue. */
function buildCurrencyList(): { value: string; label: string }[] {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "currency" })
    return Intl.supportedValuesOf("currency")
      .map((code) => ({ value: code, label: `${code} — ${names.of(code) ?? code}` }))
      .sort((a, b) => a.value.localeCompare(b.value))
  } catch {
    return [
      { value: "USD", label: "USD — US Dollar" }, { value: "EUR", label: "EUR — Euro" },
      { value: "GBP", label: "GBP — British Pound" }, { value: "CAD", label: "CAD — Canadian Dollar" },
      { value: "AUD", label: "AUD — Australian Dollar" }, { value: "JPY", label: "JPY — Japanese Yen" },
      { value: "INR", label: "INR — Indian Rupee" }, { value: "BRL", label: "BRL — Brazilian Real" },
      { value: "ZAR", label: "ZAR — South African Rand" },
    ]
  }
}

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

  const countries = useMemo(buildCountryList, [])
  const currencies = useMemo(buildCurrencyList, [])
  const currencyCodes = useMemo(() => new Set(currencies.map((c) => c.value)), [currencies])
  const countryCodes = useMemo(() => new Set(countries.map((c) => c.value)), [countries])

  const seededCountry = initialCountry && countryCodes.has(initialCountry) ? initialCountry : "US"
  const seededCurrency = (initialCountry && currencyForCountry(initialCountry)) || "USD"

  const [country, setCountry] = useState(seededCountry)
  const [baseCurrency, setBaseCurrency] = useState(currencyCodes.has(seededCurrency) ? seededCurrency : "USD")
  const [timezone, setTimezone] = useState("UTC")

  // The user hasn't picked a currency by hand yet — a country change (either from IP detection or
  // from the country dropdown) may still auto-update the currency. Once they touch the currency
  // select, this flips true and the auto-sync stops so an intentional pick isn't overwritten by a
  // later country change.
  const currencyTouched = useRef(false)

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
        if (countryCodes.has(code)) setCountry(code)
        if (!currencyTouched.current) {
          const currency = currencyForCountry(code)
          if (currency && currencyCodes.has(currency)) setBaseCurrency(currency)
        }
      } catch { /* offline / blocked / rate-limited — keep the form's own default */ }
    })()
    return () => { cancelled = true }
  }, [initialCountry, countryCodes, currencyCodes])

  const onCountryChange = (value: string) => {
    setCountry(value)
    if (!currencyTouched.current) {
      const currency = currencyForCountry(value)
      if (currency && currencyCodes.has(currency)) setBaseCurrency(currency)
    }
  }

  const onCurrencyChange = (value: string) => {
    currencyTouched.current = true
    setBaseCurrency(value)
  }

  return <form className="space-y-6" action={(formData) => startTransition(async () => {
    const result = await createInitialWorkspaceAction({
      name: String(formData.get("name") || ""),
      country: String(formData.get("country") || "US"),
      baseCurrency: String(formData.get("baseCurrency") || "USD"),
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ws-country" className="mb-1.5 block text-sm font-medium text-slate-700">Country</label>
          <select id="ws-country" name="country" value={country} onChange={(e) => onCountryChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
            {countries.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="ws-currency" className="mb-1.5 block text-sm font-medium text-slate-700">Base currency</label>
          <select id="ws-currency" name="baseCurrency" value={baseCurrency} onChange={(e) => onCurrencyChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
            {currencies.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
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

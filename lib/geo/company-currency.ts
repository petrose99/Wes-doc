/** ADR 0013: a Company is in Lesotho or South Africa, and its Company currency is one of the
 * three pairs below — LS/LSL, LS/ZAR, ZA/ZAR. Client-safe (no I/O): the creation forms, the
 * Change dialog and the server-side refusals all read these rules. */
export const COMPANY_COUNTRIES = [
  { code: "LS", label: "Lesotho" },
  { code: "ZA", label: "South Africa" },
] as const

const ALLOWED: Record<string, string[]> = { LS: ["LSL", "ZAR"], ZA: ["ZAR"] }

export function allowedCurrencies(country: string | null | undefined): string[] {
  return (country && ALLOWED[country]) || []
}

/** The first allowed currency is the country's own: LSL for Lesotho, ZAR for South Africa. */
export function defaultCurrency(country: string | null | undefined): string | null {
  return allowedCurrencies(country)[0] ?? null
}

export function isAllowedPair(country: string | null | undefined, currency: string | null | undefined): boolean {
  return !!currency && allowedCurrencies(country).includes(currency)
}

/** The country and Company currency a new company is created with: an omitted country is South
 * Africa, an omitted currency the country's own. Throws `company_country_unsupported` /
 * `company_currency_not_allowed` (mapped in action-helpers.ts) — never a silent USD. */
export function companyCountryAndCurrency(input: { country?: string | null; baseCurrency?: string | null }): { country: string; baseCurrency: string } {
  const country = input.country || "ZA"
  if (!allowedCurrencies(country).length) throw new Error("company_country_unsupported")
  const baseCurrency = input.baseCurrency || defaultCurrency(country)!
  if (!isAllowedPair(country, baseCurrency)) throw new Error("company_currency_not_allowed")
  return { country, baseCurrency }
}

/** A Personal company takes the detected country when it is supported, else South Africa
 * (#446 decision 1: an unsupported country falls back to ZAR, never to USD). */
export function personalCountry(detected: string | null | undefined): "LS" | "ZA" {
  return detected === "LS" ? "LS" : "ZA"
}

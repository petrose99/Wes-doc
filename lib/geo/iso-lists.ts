/** Every ISO 3166-1 alpha-2 region and ISO 4217 currency with its Intl display name, built from
 * the runtime's own tables so no hand-maintained list drifts. One source for the new-workspace
 * form and Admin › Companies' Add dialog (#285 B4). Both fall back to a short hard-coded set on a
 * runtime without `Intl.supportedValuesOf`. */

export type IsoOption = { value: string; label: string }

export function buildCountryList(): IsoOption[] {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" })
    // "region" is supported at runtime (ES2023+) but TS's lib.d.ts still restricts the literal
    // union to the older values — the cast unblocks that without changing behaviour.
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

export function buildCurrencyList(): IsoOption[] {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "currency" })
    return Intl.supportedValuesOf("currency")
      .map((code) => ({ value: code, label: `${code} · ${names.of(code) ?? code}` }))
      .sort((a, b) => a.value.localeCompare(b.value))
  } catch {
    return [
      { value: "USD", label: "USD · US Dollar" }, { value: "EUR", label: "EUR · Euro" },
      { value: "GBP", label: "GBP · British Pound" }, { value: "CAD", label: "CAD · Canadian Dollar" },
      { value: "AUD", label: "AUD · Australian Dollar" }, { value: "JPY", label: "JPY · Japanese Yen" },
      { value: "INR", label: "INR · Indian Rupee" }, { value: "BRL", label: "BRL · Brazilian Real" },
      { value: "ZAR", label: "ZAR · South African Rand" },
    ]
  }
}

/** The region's display name for a table cell ("United Kingdom"); the bare code when the runtime
 * has no name for it. */
export function countryName(code: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code } catch { return code }
}

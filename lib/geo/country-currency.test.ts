import { describe, expect, it } from "vitest"
import { currencyForCountry, detectCountryFromHeaders } from "./country-currency"

describe("currencyForCountry", () => {
  it("returns the ISO 4217 currency for a country in the table", () => {
    expect(currencyForCountry("US")).toBe("USD")
    expect(currencyForCountry("GB")).toBe("GBP")
    expect(currencyForCountry("LS")).toBe("LSL")
    expect(currencyForCountry("DE")).toBe("EUR")
    expect(currencyForCountry("JP")).toBe("JPY")
  })

  it("is case-insensitive", () => {
    expect(currencyForCountry("us")).toBe("USD")
    expect(currencyForCountry("Za")).toBe("ZAR")
  })

  it("returns null for an unknown country code or empty input", () => {
    expect(currencyForCountry(null)).toBeNull()
    expect(currencyForCountry("")).toBeNull()
    expect(currencyForCountry("ZZ")).toBeNull()
  })

  it("maps overseas territories to the correct in-use currency", () => {
    // Puerto Rico and Guam are USD despite being non-mainland; a plain "country-name → currency"
    // Wikipedia scrape misses these, which is the whole point of the ISO table.
    expect(currencyForCountry("PR")).toBe("USD")
    expect(currencyForCountry("GU")).toBe("USD")
    // French Guiana and Reunion are EUR — legally French territory.
    expect(currencyForCountry("GF")).toBe("EUR")
    expect(currencyForCountry("RE")).toBe("EUR")
  })
})

describe("detectCountryFromHeaders", () => {
  const build = (entries: Record<string, string>) => ({
    get: (name: string) => entries[name.toLowerCase()] ?? null,
  })

  it("reads Cloudflare's cf-ipcountry header", () => {
    expect(detectCountryFromHeaders(build({ "cf-ipcountry": "GB" }))).toBe("GB")
  })

  it("reads Vercel's x-vercel-ip-country header", () => {
    expect(detectCountryFromHeaders(build({ "x-vercel-ip-country": "US" }))).toBe("US")
  })

  it("returns null when no header is present", () => {
    expect(detectCountryFromHeaders(build({}))).toBeNull()
  })

  it("rejects Cloudflare's XX (unknown) and T1 (Tor) sentinels", () => {
    expect(detectCountryFromHeaders(build({ "cf-ipcountry": "XX" }))).toBeNull()
    expect(detectCountryFromHeaders(build({ "cf-ipcountry": "T1" }))).toBeNull()
  })

  it("rejects a malformed value rather than passing it through", () => {
    expect(detectCountryFromHeaders(build({ "cf-ipcountry": "United States" }))).toBeNull()
    expect(detectCountryFromHeaders(build({ "cf-ipcountry": "USA" }))).toBeNull()
  })

  it("normalises case", () => {
    expect(detectCountryFromHeaders(build({ "cf-ipcountry": "gb" }))).toBe("GB")
  })
})

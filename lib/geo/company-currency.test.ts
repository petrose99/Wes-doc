import { describe, expect, it } from "vitest"
import {
  COMPANY_COUNTRIES,
  allowedCurrencies,
  companyCountryAndCurrency,
  defaultCurrency,
  isAllowedPair,
  personalCountry,
} from "./company-currency"

describe("company currency rules (ADR 0013)", () => {
  it("names Lesotho and South Africa as the only company countries", () => {
    expect(COMPANY_COUNTRIES.map((c) => c.code)).toEqual(["LS", "ZA"])
    expect(COMPANY_COUNTRIES.map((c) => c.label)).toEqual(["Lesotho", "South Africa"])
  })

  it("allows LSL or ZAR in Lesotho, ZAR only in South Africa, nothing elsewhere", () => {
    expect(allowedCurrencies("LS")).toEqual(["LSL", "ZAR"])
    expect(allowedCurrencies("ZA")).toEqual(["ZAR"])
    expect(allowedCurrencies("US")).toEqual([])
    expect(allowedCurrencies(null)).toEqual([])
  })

  it("defaults Lesotho to LSL and South Africa to ZAR", () => {
    expect(defaultCurrency("LS")).toBe("LSL")
    expect(defaultCurrency("ZA")).toBe("ZAR")
    expect(defaultCurrency("GB")).toBeNull()
  })

  it("accepts exactly the three supported pairs", () => {
    expect(isAllowedPair("LS", "LSL")).toBe(true)
    expect(isAllowedPair("LS", "ZAR")).toBe(true)
    expect(isAllowedPair("ZA", "ZAR")).toBe(true)
    expect(isAllowedPair("ZA", "LSL")).toBe(false)
    expect(isAllowedPair("US", "USD")).toBe(false)
    expect(isAllowedPair("LS", "USD")).toBe(false)
  })

  it("resolves a new company's pair, defaulting to South Africa and the country's own currency", () => {
    expect(companyCountryAndCurrency({})).toEqual({ country: "ZA", baseCurrency: "ZAR" })
    expect(companyCountryAndCurrency({ country: "LS" })).toEqual({ country: "LS", baseCurrency: "LSL" })
    expect(companyCountryAndCurrency({ country: "LS", baseCurrency: "ZAR" })).toEqual({ country: "LS", baseCurrency: "ZAR" })
  })

  it("refuses an unsupported country or pair instead of falling back to USD", () => {
    expect(() => companyCountryAndCurrency({ country: "US" })).toThrow("company_country_unsupported")
    expect(() => companyCountryAndCurrency({ country: "US", baseCurrency: "USD" })).toThrow("company_country_unsupported")
    expect(() => companyCountryAndCurrency({ country: "ZA", baseCurrency: "LSL" })).toThrow("company_currency_not_allowed")
  })

  it("keeps a detected LS or ZA for a Personal company and falls back to ZA otherwise", () => {
    expect(personalCountry("LS")).toBe("LS")
    expect(personalCountry("ZA")).toBe("ZA")
    expect(personalCountry("US")).toBe("ZA")
    expect(personalCountry(null)).toBe("ZA")
  })
})

/** ISO 3166-1 alpha-2 → ISO 4217 mapping used to default a workspace's base currency from a
 * detected country. Covers every UN-recognised country plus common overseas territories so an IP
 * lookup for, say, HK, PR, or GP resolves to the currency actually in use there rather than
 * falling through to USD. A country not in this table returns null and the form keeps its own
 * default. */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  AD: "EUR", AE: "AED", AF: "AFN", AG: "XCD", AI: "XCD", AL: "ALL", AM: "AMD", AO: "AOA",
  AR: "ARS", AS: "USD", AT: "EUR", AU: "AUD", AW: "AWG", AX: "EUR", AZ: "AZN",
  BA: "BAM", BB: "BBD", BD: "BDT", BE: "EUR", BF: "XOF", BG: "BGN", BH: "BHD", BI: "BIF",
  BJ: "XOF", BL: "EUR", BM: "BMD", BN: "BND", BO: "BOB", BQ: "USD", BR: "BRL", BS: "BSD",
  BT: "BTN", BV: "NOK", BW: "BWP", BY: "BYN", BZ: "BZD",
  CA: "CAD", CC: "AUD", CD: "CDF", CF: "XAF", CG: "XAF", CH: "CHF", CI: "XOF", CK: "NZD",
  CL: "CLP", CM: "XAF", CN: "CNY", CO: "COP", CR: "CRC", CU: "CUP", CV: "CVE", CW: "ANG",
  CX: "AUD", CY: "EUR", CZ: "CZK",
  DE: "EUR", DJ: "DJF", DK: "DKK", DM: "XCD", DO: "DOP", DZ: "DZD",
  EC: "USD", EE: "EUR", EG: "EGP", EH: "MAD", ER: "ERN", ES: "EUR", ET: "ETB",
  FI: "EUR", FJ: "FJD", FK: "FKP", FM: "USD", FO: "DKK", FR: "EUR",
  GA: "XAF", GB: "GBP", GD: "XCD", GE: "GEL", GF: "EUR", GG: "GBP", GH: "GHS", GI: "GIP",
  GL: "DKK", GM: "GMD", GN: "GNF", GP: "EUR", GQ: "XAF", GR: "EUR", GS: "GBP", GT: "GTQ",
  GU: "USD", GW: "XOF", GY: "GYD",
  HK: "HKD", HM: "AUD", HN: "HNL", HR: "EUR", HT: "HTG", HU: "HUF",
  ID: "IDR", IE: "EUR", IL: "ILS", IM: "GBP", IN: "INR", IO: "USD", IQ: "IQD", IR: "IRR",
  IS: "ISK", IT: "EUR",
  JE: "GBP", JM: "JMD", JO: "JOD", JP: "JPY",
  KE: "KES", KG: "KGS", KH: "KHR", KI: "AUD", KM: "KMF", KN: "XCD", KP: "KPW", KR: "KRW",
  KW: "KWD", KY: "KYD", KZ: "KZT",
  LA: "LAK", LB: "LBP", LC: "XCD", LI: "CHF", LK: "LKR", LR: "LRD", LS: "LSL", LT: "EUR",
  LU: "EUR", LV: "EUR", LY: "LYD",
  MA: "MAD", MC: "EUR", MD: "MDL", ME: "EUR", MF: "EUR", MG: "MGA", MH: "USD", MK: "MKD",
  ML: "XOF", MM: "MMK", MN: "MNT", MO: "MOP", MP: "USD", MQ: "EUR", MR: "MRU", MS: "XCD",
  MT: "EUR", MU: "MUR", MV: "MVR", MW: "MWK", MX: "MXN", MY: "MYR", MZ: "MZN",
  NA: "NAD", NC: "XPF", NE: "XOF", NF: "AUD", NG: "NGN", NI: "NIO", NL: "EUR", NO: "NOK",
  NP: "NPR", NR: "AUD", NU: "NZD", NZ: "NZD",
  OM: "OMR",
  PA: "PAB", PE: "PEN", PF: "XPF", PG: "PGK", PH: "PHP", PK: "PKR", PL: "PLN", PM: "EUR",
  PN: "NZD", PR: "USD", PS: "ILS", PT: "EUR", PW: "USD", PY: "PYG",
  QA: "QAR",
  RE: "EUR", RO: "RON", RS: "RSD", RU: "RUB", RW: "RWF",
  SA: "SAR", SB: "SBD", SC: "SCR", SD: "SDG", SE: "SEK", SG: "SGD", SH: "SHP", SI: "EUR",
  SJ: "NOK", SK: "EUR", SL: "SLE", SM: "EUR", SN: "XOF", SO: "SOS", SR: "SRD", SS: "SSP",
  ST: "STN", SV: "USD", SX: "ANG", SY: "SYP", SZ: "SZL",
  TC: "USD", TD: "XAF", TF: "EUR", TG: "XOF", TH: "THB", TJ: "TJS", TK: "NZD", TL: "USD",
  TM: "TMT", TN: "TND", TO: "TOP", TR: "TRY", TT: "TTD", TV: "AUD", TW: "TWD", TZ: "TZS",
  UA: "UAH", UG: "UGX", UM: "USD", US: "USD", UY: "UYU", UZ: "UZS",
  VA: "EUR", VC: "XCD", VE: "VES", VG: "USD", VI: "USD", VN: "VND", VU: "VUV",
  WF: "XPF", WS: "WST",
  YE: "YER", YT: "EUR",
  ZA: "ZAR", ZM: "ZMW", ZW: "ZWL",
}

export function currencyForCountry(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] ?? null
}

/** Best-effort country from the incoming request. Cloudflare, Vercel, Fly, and most other edge
 * proxies each stamp the client country onto a header before the request reaches this app —
 * `cf-ipcountry` on Cloudflare, `x-vercel-ip-country` on Vercel, `x-country` as a common
 * pass-through — so the workspace form can render with the right default on first paint instead
 * of waiting for a client-side geolocation call. Returns null when nothing usable is set (a plain
 * Lightsail deployment behind no CDN, for instance), and the form falls back to its client-side
 * IP lookup. */
export function detectCountryFromHeaders(headers: {
  get: (name: string) => string | null
}): string | null {
  const candidate =
    headers.get("cf-ipcountry") ||
    headers.get("x-vercel-ip-country") ||
    headers.get("x-country") ||
    headers.get("x-appengine-country")
  if (!candidate) return null
  const code = candidate.trim().toUpperCase()
  // Some proxies emit "XX" for an unknown/anonymised IP or "T1" for Tor exit nodes.
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null
  return code
}

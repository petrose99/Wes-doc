/** A5.5: VIES VAT lookup (EU only). SOAP endpoint at ec.europa.eu — one call per (country
 * code, VAT number). This module is the seam: `checkVies` calls the endpoint when VIES_ENABLED
 * is set, otherwise returns { known: false } (the same shape the caller has to handle for
 * genuine unknowns anyway). Deliberately isolated so the worker job that runs it can be added
 * without touching the extraction pipeline.
 *
 * Parses the two-letter country code off the VAT number itself; VIES returns the registered
 * legal name alongside a valid flag. */

export type ViesResult = { known: false } | {
  known: true
  valid: boolean
  registeredName: string | null
  countryCode: string
  checkedAt: Date
}

const REQUEST_TIMEOUT_MS = 8_000
const SOAP_ENDPOINT = "https://ec.europa.eu/taxation_customs/vies/services/checkVatService"
const EU_CC = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU", "IE",
  "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI",
])

function parseVatNumber(raw: string | null | undefined): { cc: string; number: string } | null {
  if (!raw) return null
  const compact = raw.replace(/\s+/g, "").toUpperCase()
  const cc = compact.slice(0, 2)
  const rest = compact.slice(2)
  if (!EU_CC.has(cc) || rest.length < 4) return null
  return { cc, number: rest }
}

/** Look up one VAT number. Never throws — a lookup failure returns { known: false }. Callers
 * (models/suppliers.ts's VIES job) persist the result onto Supplier.vatVerifiedAt +
 * registeredName so the next document from that supplier doesn't re-query. */
export async function checkVies(rawVat: string | null | undefined, opts: { enabled?: boolean; fetch?: typeof globalThis.fetch } = {}): Promise<ViesResult> {
  if (opts.enabled === false) return { known: false }
  const parsed = parseVatNumber(rawVat)
  if (!parsed) return { known: false }
  const fetchImpl = opts.fetch ?? globalThis.fetch
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
 <soapenv:Body>
  <urn:checkVat>
   <urn:countryCode>${parsed.cc === "EL" ? "GR" : parsed.cc}</urn:countryCode>
   <urn:vatNumber>${parsed.number}</urn:vatNumber>
  </urn:checkVat>
 </soapenv:Body>
</soapenv:Envelope>`
  try {
    const response = await fetchImpl(SOAP_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "text/xml; charset=utf-8", soapaction: "" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return { known: false }
    const xml = await response.text()
    const valid = /<valid>true<\/valid>/i.test(xml)
    const nameMatch = xml.match(/<name>([\s\S]*?)<\/name>/i)?.[1]?.trim() ?? null
    return { known: true, valid, registeredName: nameMatch && nameMatch !== "---" ? nameMatch : null, countryCode: parsed.cc, checkedAt: new Date() }
  } catch {
    return { known: false }
  }
}

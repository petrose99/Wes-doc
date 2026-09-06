/** A2.5: vendor-onboarding red flags — cheap pattern checks that fire only for a FIRST-time
 * supplier at this workspace (documentCount <= 1). New-vendor invoices are where payment-
 * diversion attacks land, so a bundle of low-cost signals here is high value. Warn (not fail):
 * every one has a legitimate explanation, but a person should see the pattern. Pure. */
import type { CheckResult } from "@/lib/checks/types"

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.fr",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com",
  "aol.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com",
  "yandex.com", "gmx.com", "gmx.de", "mail.com", "zoho.com", "hey.com",
])

/** ISO 3166-1 alpha-2 country codes for common address forms — used only to detect an obvious
 * IBAN vs address mismatch (US supplier billing to a Nigerian IBAN, say). Keys mirror what
 * the address string could realistically contain; unknown/absent = check skipped. */
const COUNTRY_HINTS: Record<string, string> = {
  usa: "US", "united states": "US", america: "US",
  "united kingdom": "GB", uk: "GB", england: "GB", britain: "GB",
  germany: "DE", deutschland: "DE",
  france: "FR",
  ireland: "IE", éire: "IE",
  canada: "CA",
  australia: "AU",
  spain: "ES", españa: "ES",
  italy: "IT", italia: "IT",
  netherlands: "NL",
  belgium: "BE",
  switzerland: "CH", suisse: "CH",
  austria: "AT",
  poland: "PL", polska: "PL",
  portugal: "PT",
  denmark: "DK",
  sweden: "SE", sverige: "SE",
  norway: "NO",
  finland: "FI",
}

export type VendorOnboardingInput = {
  supplierName: string | null
  senderEmail: string | null
  supplierAddress: string | null
  paymentIban: string | null
  vatNumber: string | null
  vatFormatPass: boolean | null
  /** How many documents this workspace has already seen from this supplier. 0 or 1 = first
   * sighting; anything above skips this whole check (the checks pass silently). */
  supplierDocumentCount: number
}

function ibanCountry(iban: string): string {
  return iban.replace(/\s+/g, "").slice(0, 2).toUpperCase()
}

function addressCountry(address: string): string | null {
  const lower = address.toLowerCase()
  for (const [phrase, code] of Object.entries(COUNTRY_HINTS)) {
    if (lower.includes(phrase)) return code
  }
  return null
}

export function checkVendorOnboarding(input: VendorOnboardingInput): CheckResult | null {
  if (input.supplierDocumentCount > 1) return null

  const flags: string[] = []

  if (input.senderEmail) {
    const domain = input.senderEmail.trim().toLowerCase().split("@")[1] ?? ""
    if (domain && FREE_MAIL_DOMAINS.has(domain)) {
      flags.push(`sender is a free-mail address (@${domain}) — business suppliers usually invoice from their own domain`)
    }
  }
  if (input.vatNumber && input.vatFormatPass === false) {
    flags.push(`VAT number "${input.vatNumber}" does not match this region's format`)
  }
  if (input.paymentIban && input.supplierAddress) {
    const iban = input.paymentIban.replace(/\s+/g, "").toUpperCase()
    if (/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) {
      const ibanCC = ibanCountry(iban)
      const addressCC = addressCountry(input.supplierAddress)
      if (addressCC && ibanCC !== addressCC) {
        flags.push(`IBAN country ${ibanCC} does not match address country ${addressCC}`)
      }
    }
  }

  if (!flags.length) return null
  return {
    checkCode: "vendor_onboarding",
    status: "warn",
    message: `New supplier "${input.supplierName ?? "unknown"}" has ${flags.length} onboarding red flag(s): ${flags.join("; ")}.`,
    detail: { flags },
  }
}

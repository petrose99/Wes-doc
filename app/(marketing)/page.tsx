import { Faq } from "@/components/marketing/landing/faq"
import { Hero } from "@/components/marketing/landing/hero"
import { HowItWorks } from "@/components/marketing/landing/how-it-works"
import { CapabilityBridge } from "@/components/marketing/landing/capability-bridge"
import { Proof } from "@/components/marketing/landing/proof"
import { ReadsStrip } from "@/components/marketing/landing/reads-strip"
import { AccountCta } from "@/components/marketing/landing/trial-cta"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { absolute: "DocuBite — Documents in. Books out." },
  description: "Bills arrive by email, upload or API. DocuBite turns invoices, receipts and bank statements into reviewable fields, runs explainable checks, routes approvals, and posts reviewed work to QuickBooks, Xero or the built-in ledger. Payment stays on your bank's rails.",
}

export default function Home() {
  return <>
    <Hero />
    <ReadsStrip />
    <Proof />
    <HowItWorks />
    <CapabilityBridge />
    <Faq />
    <AccountCta />
  </>
}

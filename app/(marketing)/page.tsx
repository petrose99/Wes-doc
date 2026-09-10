import { Accounting } from "@/components/marketing/landing/accounting"
import { ApLoop } from "@/components/marketing/landing/ap-loop"
import { Automation } from "@/components/marketing/landing/automation"
import { Comparison } from "@/components/marketing/landing/comparison"
import { Extraction } from "@/components/marketing/landing/extraction"
import { Faq } from "@/components/marketing/landing/faq"
import { FolderChecks } from "@/components/marketing/landing/folder-checks"
import { Hero } from "@/components/marketing/landing/hero"
import { HowItWorks } from "@/components/marketing/landing/how-it-works"
import { InlineTrialCta } from "@/components/marketing/landing/inline-cta"
import { Intake } from "@/components/marketing/landing/intake"
import { Library } from "@/components/marketing/landing/library"
import { MultiCurrency } from "@/components/marketing/landing/multi-currency"
import { Pipeline } from "@/components/marketing/landing/pipeline"
import { Provenance } from "@/components/marketing/landing/provenance"
import { ReadsStrip } from "@/components/marketing/landing/reads-strip"
import { Sheets } from "@/components/marketing/landing/sheets"
import { TrialCta } from "@/components/marketing/landing/trial-cta"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { absolute: "DocuBite — AI accounts payable, end to end" },
  description: "DocuBite runs your accounts-payable loop: invoices in by email or API, coded and checked, matched to POs, approved, synced to QuickBooks/Xero/Bigcapital, and assembled into a bank-ready payment file. Payment execution stays with your bank — every step in between is DocuBite.",
}

export default function Home() {
  return <>
    <Hero />
    <ReadsStrip />
    <ApLoop />
    <InlineTrialCta />
    <HowItWorks />
    <Intake />
    <Extraction />
    <Provenance />
    <FolderChecks />
    <Pipeline />
    <Automation />
    <Sheets />
    <Accounting />
    <MultiCurrency />
    <Library />
    <Comparison />
    <Faq />
    <TrialCta />
  </>
}

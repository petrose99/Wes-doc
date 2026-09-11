import { Accounting } from "@/components/marketing/landing/accounting"
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
import { Proof } from "@/components/marketing/landing/proof"
import { Provenance } from "@/components/marketing/landing/provenance"
import { ReadsStrip } from "@/components/marketing/landing/reads-strip"
import { Sheets } from "@/components/marketing/landing/sheets"
import { TrialCta } from "@/components/marketing/landing/trial-cta"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { absolute: "DocuBite — Documents in. Books out." },
  description: "Bills arrive by email, upload or API. DocuBite reads even the hard cases, runs the fraud checks nobody else does, routes approvals, and posts to QuickBooks, Xero or your ERP — or the double-entry ledger built into DocuBite, if you'd rather start whole. Payment stays on your bank's rails.",
}

export default function Home() {
  return <>
    <Hero />
    <ReadsStrip />
    <Proof />
    <HowItWorks />
    <InlineTrialCta />
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

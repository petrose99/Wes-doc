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
import { Proof } from "@/components/marketing/landing/proof"
import { Provenance } from "@/components/marketing/landing/provenance"
import { ReadsStrip } from "@/components/marketing/landing/reads-strip"
import { Sheets } from "@/components/marketing/landing/sheets"
import { TrialCta } from "@/components/marketing/landing/trial-cta"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { absolute: "DocuBite — AI accounts payable, end to end" },
  description: "Bills in by email. DocuBite reads them, checks them, routes them for approval, records them in your books, and hands your bank a ready-to-pay file.",
}

export default function Home() {
  return <>
    <Hero />
    <ReadsStrip />
    <Proof />
    <HowItWorks />
    <ApLoop />
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

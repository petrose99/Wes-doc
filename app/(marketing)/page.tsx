import { Accounting } from "@/components/marketing/landing/accounting"
import { Automation } from "@/components/marketing/landing/automation"
import { Comparison } from "@/components/marketing/landing/comparison"
import { EmailIntake } from "@/components/marketing/landing/email-intake"
import { Faq } from "@/components/marketing/landing/faq"
import { FolderChecks } from "@/components/marketing/landing/folder-checks"
import { Hero } from "@/components/marketing/landing/hero"
import { HowItWorks } from "@/components/marketing/landing/how-it-works"
import { Library } from "@/components/marketing/landing/library"
import { Pipeline } from "@/components/marketing/landing/pipeline"
import { Provenance } from "@/components/marketing/landing/provenance"
import { ReadsStrip } from "@/components/marketing/landing/reads-strip"
import { Sheets } from "@/components/marketing/landing/sheets"
import { TrialCta } from "@/components/marketing/landing/trial-cta"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { absolute: "DocuBite — Turn documents into data you can trust" },
  description: "DocuBite reads invoices, receipts and bank statements — scans, photos and handwriting included — into a live sheet where every value traces to its source. Upload them or email them in, and hand over as much of the coding as you trust it with. Self-serve, no credit card required.",
}

export default function Home() {
  return <>
    <Hero />
    <ReadsStrip />
    <HowItWorks />
    <EmailIntake />
    <Provenance />
    <FolderChecks />
    <Pipeline />
    <Automation />
    <Sheets />
    <Accounting />
    <Library />
    <Comparison />
    <Faq />
    <TrialCta />
  </>
}

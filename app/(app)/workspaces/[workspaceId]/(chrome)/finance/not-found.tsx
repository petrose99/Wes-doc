import { FileQuestion } from "lucide-react"

/** #249: FinancePage's only `notFound()` call is `!config.integrations.bigcapital.enabled` — the
 * ledger integration isn't turned on for this deployment, not a removed surface. The generic
 * workspace not-found boundary's "This page isn't here any more" is written for an unplugged
 * surface (Worksheets/Expenses/Dictation) and reads as a permanent removal here, which is wrong:
 * Finance still exists, it just isn't connected. */
export default function FinanceNotConnected() {
  return <main className="flex flex-1 items-center justify-center p-8">
    <div className="max-w-md space-y-4 text-center">
      <FileQuestion className="mx-auto h-12 w-12 text-slate-400" />
      <h1 className="text-2xl font-bold text-slate-900">The ledger isn&apos;t connected</h1>
      <p className="text-sm text-slate-500">Finance needs an accounting integration turned on for this deployment before it can show anything here.</p>
    </div>
  </main>
}

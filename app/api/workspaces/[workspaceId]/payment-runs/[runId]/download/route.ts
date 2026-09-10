import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"
import { prisma } from "@/lib/db"
import { formatZaEftCsv, type PaymentInstruction } from "@/lib/payments/za-eft-csv"
import { decimalToNumber } from "@/lib/money"
import { notFound } from "next/navigation"

/** GET /api/workspaces/<workspaceId>/payment-runs/<runId>/download — regenerates the ZA EFT CSV
 * for a prepared run and returns it as an attachment. The CSV is not stored on the run row (a
 * regenerated file is byte-identical), keeping the persisted state small.
 *
 * Auth: workspace member. Payment-run creation itself is owner-only (see the server action) but
 * anyone with workspace access can re-download the file — a member handling the actual bank
 * upload is the exact use case the run row exists to support. */
export async function GET(_req: Request, { params }: { params: Promise<{ workspaceId: string; runId: string }> }) {
  const { workspaceId, runId } = await params
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)

  const run = await prisma.paymentRun.findFirst({
    where: { id: runId, workspaceId },
    select: {
      id: true, filename: true,
      items: {
        where: { active: true },
        select: {
          documentId: true, supplier: true, amount: true, currencyCode: true, reference: true,
          document: {
            select: {
              reviewedData: true,
              // Bank details come from the resolved Supplier row via document.template? — but we
              // stashed the essentials on the item at creation. Only supplier bank fields matter
              // per row, so fetch them by name below (rather than re-resolving through aliases,
              // which would double the query without changing results in the common case).
            },
          },
        },
      },
    },
  })
  if (!run) notFound()

  // Look up current supplier bank details by canonical name — refetched here so an updated bank
  // account since the run was created is reflected in the freshly-regenerated file.
  const suppliers = await prisma.supplier.findMany({
    where: { workspaceId, canonicalName: { in: run.items.map((i) => i.supplier) } },
    select: { canonicalName: true, iban: true, bankDetails: true },
  })
  const bankByName = new Map(suppliers.map((s) => {
    const details = (s.bankDetails ?? {}) as Record<string, unknown>
    const account = typeof details.account === "string" ? details.account : (typeof details.iban === "string" ? details.iban : (typeof s.iban === "string" ? s.iban : null))
    const branchCode = typeof details.branchCode === "string" ? details.branchCode : (typeof details.branch === "string" ? details.branch : null)
    return [s.canonicalName, { account, branchCode }]
  }))

  const instructions: PaymentInstruction[] = run.items.map((item) => {
    const bank = bankByName.get(item.supplier) ?? null
    return {
      documentId: item.documentId ?? "",
      supplier: item.supplier,
      bankAccountNumber: bank?.account ?? null,
      branchCode: bank?.branchCode ?? null,
      amount: decimalToNumber(item.amount) ?? 0,
      currencyCode: item.currencyCode,
      reference: item.reference,
    }
  })

  const csv = formatZaEftCsv(instructions)
  const filename = run.filename ?? `payment-run-${runId}.csv`
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  })
}

import { ApprovalsExpenseClaimsQueuePage, type ApprovalsExpenseClaimsSearchParams } from "../../../(queue)/approvals/expense-claims/page"

export const dynamic = "force-dynamic"

/** #273 S4: a deep link to one claim opens Approvals › Expense claims with that row selected; a
 * decided or withdrawn claim renders the queue with a notice saying so (spec §6.1). */
export default async function ApprovalsExpenseClaimDeepLinkPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string; claimId: string }>
  searchParams: Promise<ApprovalsExpenseClaimsSearchParams>
}) {
  const { workspaceId, claimId } = await params
  const query = await searchParams
  return ApprovalsExpenseClaimsQueuePage({ params: Promise.resolve({ workspaceId }), searchParams: Promise.resolve(query), selectedClaimId: claimId })
}

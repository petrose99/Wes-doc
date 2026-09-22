import { redirect } from "next/navigation"

/** #251: the Payments destination's front door is Bill Pay; Payment Batches is its second queue. */
export default async function PaymentsIndexPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  redirect(`/workspaces/${workspaceId}/payments/bill-pay`)
}

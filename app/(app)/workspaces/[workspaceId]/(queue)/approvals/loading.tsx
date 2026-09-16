import { QueueLoading } from "@/components/queue/queue-loading"

/** #236 decision #10's loading state, on the shared `QueueLoading` since #261. */
export default function ApprovalsLoading() {
  return <QueueLoading title="Approvals" />
}

import { prisma } from "@/lib/db"
import { unscoped } from "@/lib/workspace-scope"
import { verifyStopToken } from "@/lib/notices/stop-token"

/** Resolves what the public stop page (`/notices/stop`) shows for a token: the confirm page, the
 * done page after a POST, the already-off page, or the invalid page. Read-only — the write lives
 * in the POST route alone (`/notices/stop/confirm`), so a GET from a link scanner can never flip
 * the switch. `done` is only honoured with a token that still verifies, so `?done=1` pasted on
 * its own shows the invalid page rather than a false "stopped" claim. */
export type StopPageState =
  | { kind: "invalid" }
  | { kind: "confirm"; workspaceId: string; workspaceName: string }
  | { kind: "done"; workspaceId: string }
  | { kind: "already-off"; workspaceId: string }

export async function resolveStopPageState(token: string | undefined, done: boolean): Promise<StopPageState> {
  const payload = token ? verifyStopToken(token) : null
  if (!payload) return { kind: "invalid" }
  const [user, workspace] = await unscoped(() => Promise.all([
    prisma.user.findUnique({ where: { id: payload.userId }, select: { approvalNoticeEmails: true } }),
    prisma.workspace.findUnique({ where: { id: payload.workspaceId }, select: { name: true } }),
  ]))
  if (!user || !workspace) return { kind: "invalid" }
  if (done) return { kind: "done", workspaceId: payload.workspaceId }
  if (!user.approvalNoticeEmails) return { kind: "already-off", workspaceId: payload.workspaceId }
  return { kind: "confirm", workspaceId: payload.workspaceId, workspaceName: workspace.name }
}

/** The one write. Returns the redirect target for the POST route: the done page on success, the
 * invalid page when the token no longer verifies. Idempotent — a second POST (an RFC 8058 client
 * retrying) lands on the same done page. */
export async function applyStop(token: string | undefined): Promise<"done" | "invalid"> {
  const payload = token ? verifyStopToken(token) : null
  if (!payload) return "invalid"
  const result = await unscoped(() => prisma.user.updateMany({ where: { id: payload.userId }, data: { approvalNoticeEmails: false } }))
  return result.count === 0 ? "invalid" : "done"
}

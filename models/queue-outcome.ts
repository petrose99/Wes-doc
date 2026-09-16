import { prisma } from "@/lib/db"
import { cache } from "react"

/** Midnight in `timezone`, as a UTC instant — no per-user zone exists yet, so this is the
 * workspace's own (schema `Workspace.timezone`, default UTC). Avoids a date library: computes the
 * timezone's current wall-clock via `Intl`, then floors it to that day's midnight. */
export function startOfTodayIn(timezone: string): Date {
  const now = new Date()
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]))
  const asIfUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`)
  const offsetMs = asIfUtc.getTime() - now.getTime()
  const localMidnight = new Date(asIfUtc)
  localMidnight.setUTCHours(0, 0, 0, 0)
  return new Date(localMidnight.getTime() - offsetMs)
}

/** #264 spec §2: the done-state sentence's two counts — workspace-wide, not per queue type, so
 * every postable queue's empty state reports the same day's outcome. */
export const getTodayOutcome = cache(async (workspaceId: string) => {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } })
  const start = startOfTodayIn(workspace.timezone)
  const [approvedToday, postedToday] = await Promise.all([
    prisma.reviewTask.count({ where: { workspaceId, status: "approved", resolvedAt: { gte: start } } }),
    prisma.integrationPush.count({ where: { workspaceId, status: "succeeded", completedAt: { gte: start } } }),
  ])
  return { approvedToday, postedToday }
})

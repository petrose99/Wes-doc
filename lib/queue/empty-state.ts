/** #264 spec §2: the one function that decides which of the queue's three empty states renders.
 * First-use outranks filtered — a never-populated workspace that arrives with filter params (a
 * bookmarked saved view, a shared link) has nothing to clear, so it still sees first-use. */
export type EmptyQueueState = "first-use" | "filtered" | "done"

export function emptyQueueState({ workspaceDocumentCount, rowCount, filtered, hasFirstUse }: {
  workspaceDocumentCount: number
  rowCount: number
  filtered: boolean
  hasFirstUse: boolean
}): EmptyQueueState | null {
  if (rowCount > 0) return null
  if (workspaceDocumentCount === 0 && hasFirstUse) return "first-use"
  if (filtered) return "filtered"
  return "done"
}

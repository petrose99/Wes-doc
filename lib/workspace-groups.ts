export type GroupableWorkspace = {
  id: string
  name: string
  kind: string
  organizationId?: string | null
  organizationName?: string | null
}

export type WorkspaceGroup<T extends GroupableWorkspace> = { key: string; label: string | null; workspaces: T[] }

/** Shared by the switcher and the `/workspaces` picker (spec #287): org groups first
 * (alphabetical), then ungrouped team workspaces with no header, then Personal last. The
 * Dashboard's rollup tables do not use this — they stay flat per #287's spec. */
export function groupWorkspacesByOrg<T extends GroupableWorkspace>(workspaces: T[]): WorkspaceGroup<T>[] {
  const orgGroups = new Map<string, WorkspaceGroup<T>>()
  const ungrouped: T[] = []
  const personal: T[] = []

  for (const workspace of workspaces) {
    if (workspace.organizationId && workspace.organizationName) {
      const group = orgGroups.get(workspace.organizationId) ?? { key: workspace.organizationId, label: workspace.organizationName, workspaces: [] }
      group.workspaces.push(workspace)
      orgGroups.set(workspace.organizationId, group)
    } else if (workspace.kind === "personal") {
      personal.push(workspace)
    } else {
      ungrouped.push(workspace)
    }
  }

  const groups = [...orgGroups.values()].sort((a, b) => (a.label || "").localeCompare(b.label || ""))
  if (ungrouped.length) groups.push({ key: "ungrouped", label: null, workspaces: ungrouped })
  if (personal.length) groups.push({ key: "personal", label: "Personal", workspaces: personal })
  return groups
}

// SMB ceiling gate (Gate 7 per decisions #40 and #41). The gate runner itself is built out in
// #76; this module only holds the workspace-mode integration points that #75 needs to call, so
// role mutations do the right thing the moment the runner ships without needing another sweep
// through models/workspaces.ts.

/** Called when the first reviewer is added to a workspace (mode flip smb → firm). Every open
 * smb_ceiling gate in the workspace resolves with `workspace_added_reviewer` — the ceiling is
 * an SMB-only control per #41, so a firm workspace can't hold one open.
 *
 * No-op until #76 ships the gate runner: no such gate rows can exist yet. Kept as a real
 * call-site so #76 fills in the body and #75 stays untouched. */
export async function resolveOpenSmbCeilingGatesForWorkspace(_workspaceId: string, _reason: "workspace_added_reviewer"): Promise<void> {
  // Filled in by #76.
}

/** Called when the last reviewer is removed (mode flip firm → smb). Every open, non-archived
 * bill is re-evaluated; those above the 10,000 base-currency ceiling get a fresh smb_ceiling
 * gate row per #41. Existing overridden rows are skipped (same policy as the other retroactive
 * reeval sweeps in lib/gates/*).
 *
 * No-op until #76 ships the gate runner. */
export async function reevaluateOpenSmbCeilingGatesForWorkspace(_workspaceId: string): Promise<void> {
  // Filled in by #76.
}

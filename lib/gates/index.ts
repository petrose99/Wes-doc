/** Barrel for the six touchless-AP gates (#40). Importing this module wires every
 * concrete runner into `gateRegistry` for its side effect — one gate ticket = one import
 * added here + one `gateRegistry.register(...)` line. Callers who need the registry
 * (`lib/ingestion.ts`) import from this file rather than from `./registry` directly, so
 * the runners can never be silently missed by import order. */

import { gateRegistry } from "./registry"
import { duplicateGateRunner } from "./duplicate"
import { jurisdictionValidityRunner } from "./jurisdiction-validity"
import { smbCeilingGateRunner } from "./smb-ceiling"
import { matchVarianceGateRunner } from "./match-variance"
import { supplierTrustGateRunner } from "./supplier-trust"
import { confidenceBandGateRunner } from "./confidence-band"
import { warnChecksGateRunner } from "./warn-checks"

gateRegistry.register(duplicateGateRunner)
gateRegistry.register(jurisdictionValidityRunner)
// smb-ceiling is HARD and registered process-wide, but self-gates on
// `getWorkspaceMode(ctx.workspaceId) === "smb"` at run time — a firm workspace's arriving
// bills silent-pass without touching the DB beyond the mode read. That's the whole trick
// behind the ticket's "registered only when zero Reviewers" phrasing: mode can change at any
// moment (a Reviewer added / the last one removed), so the answer has to be read fresh on
// every arrival, not baked into the registry itself. See lib/gates/smb-ceiling.ts header.
gateRegistry.register(smbCeilingGateRunner)
gateRegistry.register(matchVarianceGateRunner)
gateRegistry.register(supplierTrustGateRunner)
gateRegistry.register(confidenceBandGateRunner)
// Warn-checks registers last so a workspace's own rules never pre-empt a built-in gate.
gateRegistry.register(warnChecksGateRunner)

export { gateRegistry, createGateRegistry } from "./registry"
export type { GateRegistry } from "./registry"
export type { GateContext, GateRunner, GateVerdict } from "./types"
export { overrideGate, resolveGate, GateNotFoundError } from "./actions"
export {
  listOpenGatesForDocument,
  listOpenGatesForDocuments,
  overrideEligibility,
  HARD_GATE_OVERRIDE_REFUSAL_REASON,
} from "./list"
export type { OpenGateSummary, GateOverrideEligibility } from "./list"
export {
  duplicateGateRunner,
  createDuplicateGateRunner,
  resolveDuplicateGatesAgainst,
  DUPLICATE_GATE_TYPE,
  DUPLICATE_DATE_TOLERANCE_DAYS,
} from "./duplicate"
export {
  smbCeilingGateRunner,
  createSmbCeilingGateRunner,
  resolveOpenSmbCeilingGatesForWorkspace,
  reevaluateOpenSmbCeilingGatesForWorkspace,
  SMB_CEILING_GATE_TYPE,
  SMB_CEILING_AMOUNT,
} from "./smb-ceiling"

/** Barrel for the six touchless-AP gates (#40). Importing this module wires every
 * concrete runner into `gateRegistry` for its side effect — one gate ticket = one import
 * added here + one `gateRegistry.register(...)` line. Callers who need the registry
 * (`lib/ingestion.ts`) import from this file rather than from `./registry` directly, so
 * the runners can never be silently missed by import order. */

import { gateRegistry } from "./registry"
import { duplicateGateRunner } from "./duplicate"
import { jurisdictionValidityRunner } from "./jurisdiction-validity"
import { matchVarianceGateRunner } from "./match-variance"
import { supplierTrustGateRunner } from "./supplier-trust"
import { confidenceBandGateRunner } from "./confidence-band"
import { warnChecksGateRunner } from "./warn-checks"

gateRegistry.register(duplicateGateRunner)
gateRegistry.register(jurisdictionValidityRunner)
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
  duplicateGateRunner,
  createDuplicateGateRunner,
  resolveDuplicateGatesAgainst,
  DUPLICATE_GATE_TYPE,
  DUPLICATE_DATE_TOLERANCE_DAYS,
} from "./duplicate"

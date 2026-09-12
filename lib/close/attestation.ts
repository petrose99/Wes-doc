/** #77: SMB attestation constants and the shape signCloseItem accepts.
 *
 * The exact text a signer of record ticks on close-item sign-off, plus its version. Historical
 * audit rows keep the {attestationText, attestationVersion} they were signed with, so rewording
 * the copy without a version bump would silently rewrite the past. The rule: when you change
 * `SMB_ATTESTATION_TEXT_V1`, bump `SMB_ATTESTATION_VERSION` and rename the constant.
 *
 * Firm workspaces never render or emit attestation — a reviewer's own sign-off IS the
 * accountability (mode derivation in models/workspaces.getWorkspaceMode per #75). */

export const SMB_ATTESTATION_VERSION = "v1"

export const SMB_ATTESTATION_TEXT_V1 =
  "I confirm no qualified reviewer has reviewed this work and I accept sole responsibility for the accuracy of this period."

/** What the SMB UI ticks and what the sign-off action stamps into the audit payload.
 * `text` is echoed onto the row (not just the version) precisely so a future reword doesn't
 * strand old rows referring to a version-string whose text no longer exists in source. */
export type CloseItemAttestation = {
  text: string
  version: string
}

export const currentSmbAttestation = (): CloseItemAttestation => ({
  text: SMB_ATTESTATION_TEXT_V1,
  version: SMB_ATTESTATION_VERSION,
})

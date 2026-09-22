/** #253: strings shared by the Default flow selector (client) and its server action. Kept out of
 * models/approval-defaults.ts because that module reaches next/headers through lib/audit and
 * cannot be imported by a client component. */

/** The refusal a save gets when the chosen flow was deleted between page load and Save. The
 * selector recognises it and offers Reload as the one control beside the sentence. */
export const STALE_FLOW_ERROR = "that flow no longer exists"

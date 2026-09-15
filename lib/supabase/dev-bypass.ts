import config from "@/lib/config"

/** The one identity every request resolves to when config.auth.devBypass is on. A fixed id so the
 * local User row (auto-provisioned by resolveOrProvisionUser on first visit) is reused across
 * restarts rather than minted fresh each time. */
export const DEV_BYPASS_USER = {
  id: "00000000-0000-4000-8000-00000000d0de",
  email: "dev@docubite.local",
  name: "Dev User",
} as const

export const isDevAuthBypass = () => config.auth.devBypass

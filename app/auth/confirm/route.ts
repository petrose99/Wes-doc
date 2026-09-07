import config from "@/lib/config"
import { createClient } from "@/lib/supabase/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

/** Landing route for the token_hash flow Supabase's email templates use for signup confirmation,
 * email-change confirmation, and magic links (the sibling /auth/callback handles the OAuth `code`
 * exchange used by Google sign-in and password recovery). Without this route those links 404 —
 * see the Supabase email templates, which point at /auth/confirm by default. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type") as EmailOtpType | null
  const next = url.searchParams.get("next") || "/workspaces"
  // See the same note in ../callback/route.ts — url.origin is the proxied internal request behind
  // Caddy, so it can send the visitor to the container's own localhost address instead of the site.
  const origin = config.app.baseURL

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL(next, origin))
  }

  return NextResponse.redirect(new URL("/login?error=auth_confirm_failed", origin))
}

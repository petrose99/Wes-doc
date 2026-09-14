"use client"

import { signUpAction } from "@/app/(auth)/auth-actions"
import { AuthField, PasswordField, SubmitButton } from "@/components/auth/fields"
import { GoogleButton } from "@/components/auth/google-button"
import { FormError } from "@/components/forms/error"
import { Input } from "@/components/ui/input"
import { MailCheck } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useState } from "react"

const MIN_PASSWORD_LENGTH = 8

const passwordProblem = (value: string): string | null => {
  if (value.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  if (!/[0-9]/.test(value)) return "Password must include at least one number."
  if (!/[^A-Za-z0-9]/.test(value)) return "Password must include at least one special character."
  return null
}

/** Surfaces signUpAction's typed error codes as something a person can act on — a stable mapping,
 * unlike the regex this replaced, which string-matched better-auth's raw message text and could
 * not survive a provider swap. */
const friendlyError = (code?: string) => {
  if (code === "signup_disabled") return "Sign-up is closed right now. Ask for an invitation, or contact us for access."
  if (code === "account_exists") return "An account with that email already exists — sign in instead."
  return "Could not create your account. Please try again."
}

export function SignupForm({ defaultEmail, redirectTo = "/workspaces", googleEnabled, loginHref = "/login" }: {
  defaultEmail?: string
  redirectTo?: string
  googleEnabled: boolean
  loginHref?: string
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState(defaultEmail || "")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const problem = passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await signUpAction({ name, email, password })
      if (!result.success) {
        setError(friendlyError(result.error))
        return
      }
      // Supabase requires a confirmed email before it issues a session (F4) — there is no session
      // cookie yet to navigate against, unlike the sign-in and reset flows. Once they click the
      // confirmation link, /auth/callback exchanges it for a session and lands them on redirectTo.
      setSent(true)
    } catch {
      setError(friendlyError())
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto h-9 w-9 text-emerald-700" strokeWidth={1.6} />
        <h2 className="mt-4 font-display text-xl font-bold tracking-[-0.02em] text-slate-900">Check your email</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-600">
          We sent a confirmation link to <strong className="font-medium text-slate-800">{email}</strong>. Click it to finish setting up your account.
        </p>
        <Link href={loginHref as Route} className="mt-6 inline-block text-sm font-semibold text-emerald-800 hover:underline">Back to sign in</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {googleEnabled && <GoogleButton redirectTo={redirectTo} intent="signup" onError={(message) => setError(message || null)} />}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <AuthField label="Your name">
          <Input name="name" value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" autoFocus />
        </AuthField>

        <AuthField label="Work email">
          <Input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        </AuthField>

        <PasswordField label="Password" name="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
        <p className="-mt-2 text-xs text-slate-500">At least {MIN_PASSWORD_LENGTH} characters, including a number and a special character.</p>

        <SubmitButton busy={busy}>{busy ? "Creating your workspace…" : "Create your workspace"}</SubmitButton>

        {error && <FormError>{error}</FormError>}
      </form>

      <p className="text-center text-sm text-slate-500">
        Already have an account? <Link href={loginHref as Route} className="font-semibold text-emerald-800 hover:underline">Sign in</Link>
      </p>
    </div>
  )
}

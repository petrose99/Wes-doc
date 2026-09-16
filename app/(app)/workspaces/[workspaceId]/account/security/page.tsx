import { AdminPage } from "@/components/admin/admin-ui"
import { MfaEnroll } from "@/components/auth/mfa-enroll"
import { SignOutEverywhereButton } from "@/components/auth/sign-out-everywhere-button"
import { Panel } from "@/components/automation/automation-ui"
import { getCurrentUser } from "@/lib/auth"

/** #231 Q10 (#252): Security is account-level — MFA and sessions belong to the person, not to
 * any one company — so it left Admin for the account menu. Same grammar, no phone note: a
 * person may well enrol MFA from their phone. */
export default async function SecurityPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  await params
  await getCurrentUser()

  return <AdminPage title="Security" intro="Two-factor authentication and session controls for your account." phoneNote={false}>
    <Panel title="Two-factor authentication" note="Required to open a workspace with HIPAA mode on.">
      <MfaEnroll />
    </Panel>
    <Panel title="Sessions" note="If you signed in somewhere you don't recognise, end every session at once.">
      <SignOutEverywhereButton />
    </Panel>
  </AdminPage>
}

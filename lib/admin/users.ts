// Client-safe types and pure helpers for Admin › Users (#286). No Prisma here: the loader lives
// in models/admin-users.ts; client components import from this file only (admin.md primer).

export type UserRole = "owner" | "reviewer" | "member"

export type UserRowCompany = {
  workspaceId: string
  workspaceName: string
  role: UserRole
  /** The viewer is an owner of this company — the pane's section is editable (spec §3.4). */
  viewerOwns: boolean
  isCurrent: boolean
}

/** One person with access (a member) or one pending invitation (spec §2 `UserRow`). Invited rows
 * key as `inv:<invitationId>` — never the email in the URL. `bank` exists only when the server
 * decided the viewer may see it (owner of the current company or the row is the viewer). */
export type UserRow = {
  key: string
  kind: "member" | "invited"
  userId: string | null
  invitationId: string | null
  name: string | null
  email: string
  companies: UserRowCompany[]
  /** Role in the current company, or null when not a member of it. */
  roleHere: UserRole | null
  isViewer: boolean
  /** Member: joined the current company; invited: sent. ISO string (serialisable). */
  createdAt: string | null
  expiresAt: string | null
  expired: boolean
  orgRole: "admin" | null
  bank?: { bankName: string; lastFour: string } | null
  /** Invited rows: who sent it and whether the viewer owns the primary company (Resend/Revoke). */
  sentBy?: string | null
  viewerOwnsPrimary?: boolean
  primaryWorkspaceName?: string | null
}

export type UsersPageMode = "org" | "team" | "personal"

export type UsersPageData = {
  mode: UsersPageMode
  rows: UserRow[]
  /** Companies the viewer owns — the Invite dialog's rows and Add-to-company's options. */
  ownedCompanies: { workspaceId: string; name: string }[]
  /** Companies the viewer is a member of but does not own — the Invite dialog's "ask their owners" line. */
  unownedCompanies: { workspaceId: string; name: string }[]
  ownersByCompany: Record<string, string[]>
  organizationName: string | null
  /** Companies in the org the viewer cannot see. */
  hiddenCompanyCount: number
  currentCompany: { workspaceId: string; name: string; kind: "personal" | "team" }
}

export const ROLE_LABELS: Record<UserRole, string> = { owner: "Owner", reviewer: "Reviewer", member: "Member" }

/** The one consequence sentence under a role select (spec §4.1). */
export const ROLE_CONSEQUENCE: Record<UserRole, (company: string) => string> = {
  owner: (company) => `Full control of ${company}, including deleting it.`,
  reviewer: () => "Signs off on close; approvals can be assigned to them.",
  member: () => "Uploads, reviews, searches and exports.",
}

/** A sentence that ends on a company name: "Riverside Bakery Co." must not become "Co..". */
export function endSentence(name: string): string {
  return name.endsWith(".") ? name : `${name}.`
}

export function displayName(row: Pick<UserRow, "name" | "email">): string {
  return row.name?.trim() || row.email
}

export function statusLabel(row: UserRow): "Active" | "Invited" | "Invitation expired" {
  if (row.kind === "member") return "Active"
  return row.expired ? "Invitation expired" : "Invited"
}

/** Trim, lower-case and strip diacritics on both sides (spec §2 search). */
export function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

export function filterUserRows(rows: UserRow[], params: URLSearchParams): UserRow[] {
  const roles = params.getAll("role").filter(Boolean)
  const statuses = params.getAll("status").filter(Boolean)
  const companies = params.getAll("company").filter(Boolean)
  const q = normalizeSearch(params.get("q") ?? "")
  return rows.filter((row) => {
    if (roles.length && !roles.includes(row.roleHere ?? "none")) return false
    if (statuses.length) {
      const status = row.kind === "member" ? "active" : row.expired ? "expired" : "invited"
      if (!statuses.includes(status)) return false
    }
    if (companies.length && !row.companies.some((company) => companies.includes(company.workspaceId))) return false
    if (q && !normalizeSearch(`${row.name ?? ""} ${row.email}`).includes(q)) return false
    return true
  })
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

/** Error codes the actions return, mapped to the sentences the UI shows (spec §4). `:name` suffixes
 * carry the company the code is about. */
export function actionErrorText(code: string, context: { name?: string; company?: string; owners?: string[]; email?: string } = {}): string {
  const [base, suffix] = code.split(":", 2)
  const company = suffix || context.company || "this company"
  const who = context.name || "This person"
  const owners = context.owners?.length ? context.owners.join(", ") : "an owner"
  switch (base) {
    case "invalid_email": return "Enter an email address like name@company.com."
    case "self_invite": return "That's you — you're already here."
    case "member_already_exists": return `${context.email ?? who} already has access to ${endSentence(company)} Open their row to add companies or change roles.`
    case "owner_required": return suffix ? `Only an owner of ${company} can invite to it — untick it or ask ${owners}.` : `You're no longer an owner of ${endSentence(company)}`
    case "last_owner_required": return `${who} is now the only owner of ${company} — choose another owner first.`
    case "last_reviewer_removal_requires_confirmation": return `${who} is the only reviewer of ${endSentence(company)}`
    case "cannot_leave_personal_workspace": return "You can't leave your personal workspace."
    case "transfer_ownership_before_leaving":
    case "delete_workspace_instead": return `You're the only owner of ${company} — make someone else an owner, or delete the company on Companies.`
    case "invitation_expired": return "That link has expired — resend to issue a new one."
    case "invalid_bank_details": return "Check the bank details: bank name, a 6–20 digit account number and a 3–10 character branch code."
    case "not_found": return context.email ? "That invitation no longer exists." : `${who} is no longer in ${endSentence(company)}`
    case "offline": return "You're offline — nothing was changed."
    default: return code.replaceAll("_", " ")
  }
}

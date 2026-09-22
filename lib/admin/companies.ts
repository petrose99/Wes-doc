/** Companies (#285): the row the page lists and the pane loads, plus the map from the actions'
 * named error codes to the sentences the UI shows (spec §2, §4). Client-safe — no Prisma here. */

export type CompanyViewerRole = "owner" | "reviewer" | "member"

export type CompanyRow = {
  id: string
  name: string
  country: string
  baseCurrency: string
  jurisdictionCode: string | null
  memberCount: number
  viewerRole: CompanyViewerRole
  isCurrent: boolean
  createdAt: string
}

/** The pane's row (spec §5.1) — the list row plus what only the detail view needs: owner names
 * for the "n · owners: A, B" line. Loaded fresh per pane open; never carried in `CompanyRow`. */
export type CompanyDetailRow = CompanyRow & { owners: string[] }

/** Every refusal an action can return. The actions never return prose; the UI maps here. */
export type CompanyActionCode =
  | "owner_required"
  | "not_in_organization"
  | "not_found"
  | "already_grouped"
  | "name_taken"
  | "last_owner_required"
  | "last_reviewer"
  | "name_required"
  | "personal_workspace"
  | "is_current"
  | "failed"

/** Spec §4 copy, one sentence per code. `name` is the company the action targeted, `org` the
 * current organization; both are optional because some refusals arrive before either is known. */
export function companyActionErrorText(code: string, context: { name?: string; org?: string } = {}): string {
  const name = context.name ?? "this company"
  const org = context.org ?? "the organization"
  switch (code) {
    case "owner_required": return `Only ${name}'s owner can do that.`
    case "not_in_organization": return `${name} is no longer in ${org}.`
    case "not_found": return `${name} no longer exists.`
    case "already_grouped": return `${name} was already moved into another organization.`
    case "name_taken": return `A company called ${name} already exists in ${org}. Choose another name.`
    case "name_required": return "Enter a name."
    case "personal_workspace": return "A personal workspace can't join an organization."
    case "is_current": return "Switch to another company to remove this one."
    case "last_owner_required": return "You're the only owner. Make someone else an owner on Users first."
    case "last_reviewer": return `You're the last reviewer — approvals in ${name} will wait until an owner assigns another.`
    default: return "Something went wrong. Your entries are still here — try again."
  }
}

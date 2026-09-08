import { describe, expect, it } from "vitest"
import { postSignInDestination } from "@/lib/auth-post-sign-in"

describe("postSignInDestination", () => {
  it("sends an account with a pending second factor to the challenge", () => {
    expect(postSignInDestination({ currentLevel: "aal1", nextLevel: "aal2" }, "/workspaces")).toBe("/mfa/challenge?next=%2Fworkspaces")
  })

  it("goes straight through once the second factor is already satisfied", () => {
    expect(postSignInDestination({ currentLevel: "aal2", nextLevel: "aal2" }, "/workspaces")).toBe("/workspaces")
  })

  it("goes straight through for an account with no factor enrolled", () => {
    expect(postSignInDestination({ currentLevel: "aal1", nextLevel: "aal1" }, "/workspaces")).toBe("/workspaces")
  })

  // getAuthenticatorAssuranceLevel returns { data: null } on failure; treating that as "challenge
  // needed" would strand every user on an MFA page they may have no factor for.
  it("goes straight through when the assurance level could not be read", () => {
    expect(postSignInDestination(null, "/workspaces")).toBe("/workspaces")
  })

  it("preserves an invite destination through the challenge", () => {
    expect(postSignInDestination({ currentLevel: "aal1", nextLevel: "aal2" }, "/invite/abc123")).toBe("/mfa/challenge?next=%2Finvite%2Fabc123")
  })
})

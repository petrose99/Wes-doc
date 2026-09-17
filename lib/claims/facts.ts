// Client-safe shapes for what a receipt's Approval tab (S3) and the Approvals › Expense claims
// pane (S4) show about a claim. Built by models/expense-claims.ts `buildClaimFacts`; never
// imported from a model here (components import this file, not the model).
import type { ClaimEligibility } from "@/lib/claims/eligibility"

export type ClaimStatus = "draft" | "submitted" | "approved" | "rejected"

export type ClaimReceipt = { documentId: string; itemId: string; merchant: string; amount: number | null; currencyCode: string | null; date: string | null }

export type ClaimDecision = { id: string; stageIndex: number; stageName: string; decision: "approve" | "reject"; note: string | null; actorName: string; decidedAt: string }

export type DocumentClaimFacts = {
  id: string
  name: string
  status: ClaimStatus
  claimant: { id: string; name: string }
  isMine: boolean
  isOwner: boolean
  receiptCount: number
  /** Frozen `total` once submitted; `sumReceiptTotals` of the items while draft. */
  total: number
  currencyCode: string | null
  missingAmounts: number
  mixed: boolean
  byCurrency: { currencyCode: string; total: number }[]
  frozen: boolean
  canSubmit: boolean
  /** Visible reason under a disabled Submit (0 amounts, mixed currencies); null when it can submit. */
  submitDisabledReason: string | null
  /** "Any owner" or "‹stage› approvers" — who the confirm says will decide it. */
  submitGoesTo: string
  canWithdraw: boolean
  canDelete: boolean
  canRemove: boolean
  canDecide: boolean
  hasWorkflow: boolean
  submittedAt: string | null
  waitingOn: string | null
  waitingOnYou: boolean
  stageLabel: string | null
  approval: { by: string; at: string } | null
  rejection: { reason: string | null; by: string; at: string } | null
  deletedReceiptCount: number
  receipts: ClaimReceipt[]
  decisions: ClaimDecision[]
  pendingStages: Array<{ stageIndex: number; stageName: string }>
  timelineApproval: {
    startedBy: { name: string; avatar: string | null } | null
    startedAt: string
    stages: Array<{ stageIndex: number; name: string }>
    currentStageIndex: number
    waitingOnYou: boolean
    waitingOn: string
  } | null
}

export type DocumentClaimView = { claim: DocumentClaimFacts | null; claimEligibility: ClaimEligibility }

export type DraftClaimOption = { id: string; name: string; receiptCount: number; total: number; currencyCode: string | null; mixed: boolean }

export type AddToClaimResult = { claimId: string; name: string; added: string[]; heldBack: Array<{ id: string; merchant: string; reason: string }> }

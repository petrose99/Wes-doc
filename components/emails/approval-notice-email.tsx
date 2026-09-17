import React from "react"
import config from "@/lib/config"
import { formatMoney } from "@/lib/money"
import { EmailLayout } from "./email-layout"

export type ApprovalNoticeRow = {
  kind: "reached" | "nudge" | "sent_back"
  supplier: string | null
  invoiceNumber: string | null
  amount: number | null
  currency: string | null
  url: string
  /** Days since the current stage was reached — 0 for a fresh "reached" row and the send-back row. */
  waitingDays: number
}

interface ApprovalNoticeEmailProps {
  heading: string
  rows: ApprovalNoticeRow[]
  workspaceName: string
  openUrl: string
  stopUrl: string
  footerVariant: "approver" | "starter"
  /** Only set for a sent-back mail — the reason the actor gave, quoted in the lead. */
  reason?: string
}

const BUTTON_STYLE: React.CSSProperties = {
  display: "inline-block", minWidth: "100%", boxSizing: "border-box", textAlign: "center",
  padding: "14px 24px", backgroundColor: "#047857", color: "#ffffff", borderRadius: "6px",
  fontSize: "15px", fontWeight: 600, textDecoration: "none", lineHeight: "16px",
}

/** #271's Approval notice — see spec.md §3 for the full copy matrix and layout. Left-aligned
 * throughout (email-layout.tsx's .header class is already left, unlike ReminderEmail's centred
 * inline styles): a task surface, not a persuasive one — every row is "open it", never "approve
 * it" from the mail (H5, no destructive action reachable from a forwarded link). */
export const ApprovalNoticeEmail: React.FC<ApprovalNoticeEmailProps> = ({ heading, rows, workspaceName, openUrl, stopUrl, footerVariant, reason }) => {
  const isSentBack = rows[0]?.kind === "sent_back"
  const hasNudge = rows.some((row) => row.kind === "nudge")
  const hasReached = rows.some((row) => row.kind === "reached")

  return (
    <EmailLayout preview={heading}>
      <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginBottom: "16px" }}>DocuBite</div>
      <h1 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: 600, color: "#0f172a", margin: "0 0 8px", textAlign: "left" }}>{heading}</h1>
      {isSentBack ? (
        <p style={{ fontSize: "15px", color: "#475569", margin: "0 0 16px", textAlign: "left" }}>
          Reason: &ldquo;{reason?.trim() || "No reason was given."}&rdquo;
        </p>
      ) : (
        <p style={{ fontSize: "15px", color: "#475569", margin: "0 0 16px", textAlign: "left" }}>
          {hasReached && !hasNudge && "These reached a stage you can decide."}
          {!hasReached && hasNudge && `Still undecided after ${Math.max(...rows.map((row) => row.waitingDays))} days. Nothing happens until someone decides.`}
          {hasReached && hasNudge && "These reached a stage you can decide, and some are still waiting."}
        </p>
      )}

      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: "16px" }}>
        <tbody>
          {rows.map((row, index) => {
            const label = [row.supplier ?? "An invoice", row.invoiceNumber, formatMoney(row.amount, row.currency), "open in DocuBite"].filter(Boolean).join(", ")
            return (
              <tr key={index} style={{ borderTop: index > 0 ? "1px solid #e2e8f0" : undefined }}>
                <td style={{ padding: "16px 0 8px" }}>
                  <div style={{ wordBreak: "normal", overflowWrap: "anywhere" }}>
                    <a href={row.url} aria-label={label} style={{ fontSize: "16px", fontWeight: 600, color: "#0f172a", textDecoration: "underline" }}>{row.supplier ?? "An invoice"}</a>
                    {row.invoiceNumber && <span style={{ fontSize: "14px", color: "#475569" }}> · {row.invoiceNumber}</span>}
                    <span style={{ fontSize: "16px", color: "#0f172a", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}> · {formatMoney(row.amount, row.currency)}</span>
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                    {row.kind === "nudge" ? `waiting ${row.waitingDays} days` : row.kind === "sent_back" ? "sent back for review" : "needs your approval"}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td>
              <a href={openUrl} style={BUTTON_STYLE}>Open in {config.app.title}</a>
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: "13px", color: "#64748b", marginTop: "24px", lineHeight: "20px", maxWidth: "460px" }}>
        {footerVariant === "approver"
          ? <>You get this because you can decide these approvals in {workspaceName}.<br /></>
          : <>You get this because you started this approval.<br /></>}
        <a href={stopUrl} style={{ color: "#475569", textDecoration: "underline" }}>Stop these emails</a><br />
        Or change it under Account &rsaquo; Approval emails.
      </p>
    </EmailLayout>
  )
}

import React from "react"
import { render } from "@react-email/render"
import { ApprovalNoticeEmail } from "@/components/emails/approval-notice-email"
import { APPROVAL_NOTICE_FIXTURES, type ApprovalNoticeFixtureCase } from "@/lib/notices/fixtures"

/** Dev-only preview for #271's Approval notice — never reachable outside development, so a
 * capture round can render every copy-matrix case without a live workspace or a sent email. */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 })

  const { searchParams } = new URL(request.url)
  const caseName = (searchParams.get("case") ?? "single") as ApprovalNoticeFixtureCase
  const fixture = APPROVAL_NOTICE_FIXTURES[caseName]
  if (!fixture) return new Response(`Unknown case "${caseName}". Known cases: ${Object.keys(APPROVAL_NOTICE_FIXTURES).join(", ")}`, { status: 404 })

  const stopUrl = "https://app.docubite.com/notices/stop?t=preview-token"
  const openUrl = fixture.rows.length === 1 ? fixture.rows[0].url : "https://app.docubite.com/workspaces/w1/approvals/invoices?via=notice"
  const element = React.createElement(ApprovalNoticeEmail, { ...fixture, stopUrl, openUrl })

  if (searchParams.get("text") === "1") {
    const text = await render(element, { plainText: true })
    return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } })
  }
  const html = await render(element)
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
}

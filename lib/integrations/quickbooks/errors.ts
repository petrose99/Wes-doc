import { classifyHttpStatus, IntegrationPermanentError } from "@/lib/integrations/errors"

/** QuickBooks-specific error mapping. The retry decision is the HTTP status, same as every other
 * provider — except Fault code 5030 ("Feature Not Supported"): the company's plan turned down a
 * field the bill carried (a Class, Location or Billable flag its plan lacks), which no retry fixes.
 * The body may not be JSON (a proxy error page, or a caller's own snippet such as "bill_not_found"). */
export function quickbooksApiError(status: number, bodySnippet = ""): Error {
  if (status === 400) {
    try {
      const fault = (JSON.parse(bodySnippet) as { Fault?: { Error?: { code?: string }[] } }).Fault
      if (fault?.Error?.some((error) => error.code === "5030")) return new IntegrationPermanentError("quickbooks_feature_not_supported")
    } catch { /* not JSON: classified by status below */ }
  }
  return classifyHttpStatus(status, bodySnippet)
}

import { classifyHttpStatus } from "@/lib/integrations/errors"

/** Sage-specific error mapping. Same status-code-driven classification as every other provider
 * here — this exists so callers have one place to build the error from a Sage response. */
export function sageApiError(status: number, bodySnippet = ""): Error {
  return classifyHttpStatus(status, bodySnippet)
}

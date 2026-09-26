import { describe, expect, it } from "vitest"
import { IntegrationPermanentError, IntegrationRetryableError } from "@/lib/integrations/errors"
import { quickbooksApiError } from "@/lib/integrations/quickbooks/errors"

const fault = (code: string) => JSON.stringify({ Fault: { Error: [{ Message: "Feature Not Supported", code }], type: "ValidationFault" } })

describe("quickbooksApiError", () => {
  it("reads a 5030 Fault as a field the company's plan doesn't offer — terminal", () => {
    const error = quickbooksApiError(400, fault("5030"))
    expect(error).toBeInstanceOf(IntegrationPermanentError)
    expect((error as IntegrationPermanentError).code).toBe("quickbooks_feature_not_supported")
  })

  it("classifies any other Fault by its HTTP status", () => {
    expect((quickbooksApiError(400, fault("6000")) as IntegrationPermanentError).code).toBe("http_400")
    expect(quickbooksApiError(503, fault("5030"))).toBeInstanceOf(IntegrationRetryableError)
  })

  it("takes a body that isn't JSON", () => {
    expect((quickbooksApiError(404, "bill_not_found") as IntegrationPermanentError).code).toBe("http_404")
  })
})

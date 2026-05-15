import { describe, expect, it } from "vitest";
import { normalizeNdiProofEvent } from "../../src/services/ndiEventService.js";

describe("ndiEventService", () => {
  it("normalizes ProofValidated employment attributes from object values", () => {
    const proof = normalizeNdiProofEvent({
      verification_result: "ProofValidated",
      proofRequestThreadId: "thread-1",
      holderDID: "did:key:mock-procurement-officer",
      requested_presentation: {
        revealed_attrs: {
          "Employment ID": { value: "PROC-001" },
          Position: { value: "Procurement Officer" },
          Employer: { value: "Ministry of Finance" },
          "Employment Type": { value: "Regular" }
        }
      }
    });

    expect(proof).toEqual({
      threadId: "thread-1",
      verificationResult: "ProofValidated",
      holderDID: "did:key:mock-procurement-officer",
      attributes: {
        employmentId: "PROC-001",
        position: "Procurement Officer",
        employer: "Ministry of Finance",
        employmentType: "Regular"
      }
    });
  });

  it("rejects non-validated proof results", () => {
    expect(() => normalizeNdiProofEvent({ verification_result: "ProofRejected" })).toThrow(
      "NDI proof was not validated"
    );
  });
});

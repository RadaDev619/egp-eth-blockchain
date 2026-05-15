import { describe, expect, it } from "vitest";
import { getDemoProfileByEmploymentId, mapEmploymentToRole } from "../../src/services/roleMappingService.js";

describe("roleMappingService", () => {
  it("maps employment attributes to backend-owned roles", () => {
    expect(mapEmploymentToRole(getDemoProfileByEmploymentId("PROC-001"))).toBe("PROCUREMENT_OFFICER");
    expect(mapEmploymentToRole(getDemoProfileByEmploymentId("VEND-001"))).toBe("VENDOR");
    expect(mapEmploymentToRole(getDemoProfileByEmploymentId("EVAL-001"))).toBe("EVALUATOR");
    expect(mapEmploymentToRole(getDemoProfileByEmploymentId("FIN-001"))).toBe("FINANCE_OFFICER");
    expect(mapEmploymentToRole(getDemoProfileByEmploymentId("AUD-001"))).toBe("AUDITOR");
  });

  it("rejects frontend-tampered employment attributes", () => {
    expect(() =>
      mapEmploymentToRole({
        ...getDemoProfileByEmploymentId("VEND-001"),
        employer: "Ministry of Finance",
        position: "Finance Officer"
      })
    ).toThrow("Employment credential does not map");
  });
});

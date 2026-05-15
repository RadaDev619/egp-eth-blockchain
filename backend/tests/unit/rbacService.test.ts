import { describe, expect, it } from "vitest";
import { hasPermission } from "../../src/services/rbacService.js";
import { permissions } from "../../src/types/domain.js";

describe("rbacService", () => {
  it("uses explicit role permissions only", () => {
    expect(hasPermission("PROCUREMENT_OFFICER", permissions.CREATE_TENDER)).toBe(true);
    expect(hasPermission("PROCUREMENT_OFFICER", permissions.APPROVE_PAYMENT)).toBe(false);
    expect(hasPermission("VENDOR", permissions.SUBMIT_BID)).toBe(true);
    expect(hasPermission("VENDOR", permissions.APPROVE_EVALUATION)).toBe(false);
    expect(hasPermission("AUDITOR", permissions.VIEW_AUDIT_LOGS)).toBe(true);
    expect(hasPermission("AUDITOR", permissions.APPROVE_PAYMENT)).toBe(false);
  });
});

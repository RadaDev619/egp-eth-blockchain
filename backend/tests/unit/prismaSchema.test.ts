import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const schema = fs.readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const seed = fs.readFileSync(path.join(process.cwd(), "prisma", "seed.ts"), "utf8");

describe("Prisma schema", () => {
  it("contains the Phase 3 data models", () => {
    const models = [
      "NDIProfile",
      "User",
      "AuthSession",
      "RolePermission",
      "Tender",
      "TenderVersion",
      "Bid",
      "Approval",
      "ProcurementTransition",
      "AuditLog",
      "BlockchainTransaction",
      "NDIProofRequest"
    ];

    for (const model of models) {
      expect(schema).toContain(`model ${model} `);
    }
  });

  it("keeps AuditLog append-only by omitting mutable update/delete design hooks", () => {
    const auditLogModel = schema.slice(schema.indexOf("model AuditLog"), schema.indexOf("model BlockchainTransaction"));

    expect(auditLogModel).toContain("createdAt");
    expect(auditLogModel).not.toContain("updatedAt");
    expect(auditLogModel).not.toContain("deletedAt");
  });

  it("keeps deterministic demo seed data for judge resets", () => {
    expect(seed).toContain('"TDR-DEMO-001"');
    expect(seed).toContain('"tender-demo-001"');
    expect(seed).toContain('"PROC-001"');
    expect(seed).toContain('"VEND-001"');
    expect(seed).toContain('"EVAL-001"');
    expect(seed).toContain('"FIN-001"');
    expect(seed).toContain('"AUD-001"');
    expect(seed).toContain('"INVALID_TRANSITION_ATTEMPTED"');
    expect(seed).toContain('"UNAUTHORIZED_ACTION_ATTEMPTED"');
    expect(seed).toContain('"EVALUATION_REQUIRED_BEFORE_PAYMENT"');
    expect(seed).toContain('"ROLE_NOT_ALLOWED"');
  });
});

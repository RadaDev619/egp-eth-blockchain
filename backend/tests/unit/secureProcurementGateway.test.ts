import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../src/types/domain.js";
import { permissions } from "../../src/types/domain.js";

const db = vi.hoisted(() => ({
  tenders: [] as Array<Record<string, unknown>>,
  stakeholders: [] as Array<Record<string, unknown>>,
  assignments: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
  reset() {
    this.tenders.length = 0;
    this.stakeholders.length = 0;
    this.assignments.length = 0;
    this.auditLogs.length = 0;
  }
}));

function includeStakeholder(assignment: Record<string, unknown>) {
  return {
    ...assignment,
    stakeholder: db.stakeholders.find((stakeholder) => stakeholder.id === assignment.stakeholderId) ?? null
  };
}

vi.mock("../../src/utils/prisma.js", () => {
  const prisma = {
    tender: {
      findUnique: vi.fn(async ({ where }) => db.tenders.find((tender) => tender.id === where.id) ?? null)
    },
    tenderRoleAssignment: {
      findFirst: vi.fn(async ({ where }) => {
        const assignment = db.assignments.find((candidate) => {
          const stakeholder = db.stakeholders.find((item) => item.id === candidate.stakeholderId);
          const stakeholderMatches =
            !where.stakeholder ||
            where.stakeholder.OR.some(
              (condition: Record<string, string>) =>
                ("userId" in condition && stakeholder?.userId === condition.userId) ||
                ("employeeHash" in condition && stakeholder?.employeeHash === condition.employeeHash)
            );

          return (
            candidate.tenderId === where.tenderId &&
            (!where.role || candidate.role === where.role) &&
            (!where.status || candidate.status === where.status) &&
            stakeholderMatches
          );
        });

        if (!assignment) {
          return null;
        }

        if (where.select) {
          return { id: assignment.id };
        }

        return includeStakeholder(assignment);
      }),
      findMany: vi.fn(async ({ where }) =>
        db.assignments.filter((assignment) => assignment.tenderId === where.tenderId).map(includeStakeholder)
      )
    },
    auditLog: {
      create: vi.fn(async ({ data }) => {
        const audit = { id: `audit-${db.auditLogs.length + 1}`, createdAt: new Date(), ...data };
        db.auditLogs.push(audit);
        return audit;
      })
    }
  };

  return { prisma };
});

const { checkSecureGatewayAction, getSecureGatewayContext } = await import("../../src/services/secureProcurementGateway.js");

const vendor: AuthenticatedUser = {
  userId: "vendor-user",
  profileId: "profile-vendor",
  holderDID: "did:key:vendor",
  employmentId: "VEND-001",
  employeeHash: "0xvendor",
  employer: "Demo Vendor Pvt Ltd",
  position: "Vendor Representative",
  employmentType: "Contract",
  role: "VENDOR",
  permissions: [permissions.SUBMIT_PROPOSAL_PACKAGE, permissions.COMMIT_PROPOSAL_ENVELOPE]
};

const procurementOfficer: AuthenticatedUser = {
  userId: "proc-user",
  profileId: "profile-proc",
  holderDID: "did:key:proc",
  employmentId: "PROC-001",
  employeeHash: "0xproc",
  employer: "Ministry of Finance",
  position: "Procurement Officer",
  employmentType: "Regular",
  role: "PROCUREMENT_OFFICER",
  permissions: [permissions.CREATE_TENDER_MANIFEST, permissions.MANAGE_TENDER_ASSIGNMENTS]
};

const validHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("secureProcurementGateway", () => {
  beforeEach(() => {
    db.reset();
    db.tenders.push({
      id: "tender-1",
      tenderCode: "TDR-GATEWAY-001",
      currentState: "PUBLISHED",
      createdByEmployeeHash: "0xproc",
      createdByRole: "PROCUREMENT_OFFICER"
    });
    db.stakeholders.push(
      {
        id: "stakeholder-vendor",
        userId: "vendor-user",
        employeeHash: "0xvendor",
        stakeholderType: "VENDOR"
      },
      {
        id: "stakeholder-proc",
        userId: "proc-user",
        employeeHash: "0xproc",
        stakeholderType: "PROCURING_AGENCY"
      }
    );
    db.assignments.push(
      {
        id: "assignment-vendor",
        tenderId: "tender-1",
        stakeholderId: "stakeholder-vendor",
        role: "VENDOR",
        status: "ACTIVE",
        assignedAt: new Date()
      },
      {
        id: "assignment-proc",
        tenderId: "tender-1",
        stakeholderId: "stakeholder-proc",
        role: "PROCUREMENT_OFFICER",
        status: "ACTIVE",
        assignedAt: new Date()
      }
    );
  });

  it("validates an allowlisted gateway action with tender assignment and hash commitment", async () => {
    const result = await checkSecureGatewayAction(
      {
        tenderId: "tender-1",
        action: "SUBMIT_PROPOSAL_PACKAGE",
        metadata: {
          packageHash: validHash
        }
      },
      vendor
    );

    expect(result).toMatchObject({
      allowed: true,
      action: "SUBMIT_PROPOSAL_PACKAGE",
      tenderState: "PUBLISHED",
      assignmentId: "assignment-vendor",
      requiredPermission: permissions.SUBMIT_PROPOSAL_PACKAGE
    });
    expect(result.metadataHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "SECURE_GATEWAY_POLICY_VALIDATED",
      status: "SUCCESS",
      actorRole: "VENDOR",
      actorEmployeeHash: "0xvendor",
      permissionChecked: permissions.SUBMIT_PROPOSAL_PACKAGE
    });
    expect(JSON.stringify(db.auditLogs.at(-1))).not.toContain("VEND-001");
  });

  it("rejects sensitive metadata before any storage or blockchain action can run", async () => {
    await expect(
      checkSecureGatewayAction(
        {
          tenderId: "tender-1",
          action: "SUBMIT_PROPOSAL_PACKAGE",
          metadata: {
            packageHash: validHash,
            employmentId: "VEND-001"
          }
        },
        vendor
      )
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "VALIDATION_ERROR"
    });

    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "SECURE_GATEWAY_METADATA_REJECTED",
      status: "BLOCKED",
      actorRole: "VENDOR",
      actorEmployeeHash: "0xvendor",
      rejectionReason: "VALIDATION_ERROR"
    });
  });

  it("blocks actions that are not valid for the tender stage", async () => {
    await expect(
      checkSecureGatewayAction(
        {
          tenderId: "tender-1",
          action: "CREATE_TENDER_MANIFEST",
          metadata: {
            manifestHash: validHash
          }
        },
        procurementOfficer
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_TRANSITION"
    });

    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "UNAUTHORIZED_ACTION_ATTEMPTED",
      status: "BLOCKED",
      actorRole: "PROCUREMENT_OFFICER",
      rejectionReason: "TENDER_STATE_NOT_ALLOWED"
    });
  });

  it("returns a tender gateway context with allowed actions for the assigned role", async () => {
    const context = await getSecureGatewayContext("tender-1", vendor);

    expect(context.assignment).toMatchObject({
      id: "assignment-vendor",
      role: "VENDOR"
    });
    expect(context.actions).toContainEqual(
      expect.objectContaining({
        action: "SUBMIT_PROPOSAL_PACKAGE",
        allowed: true
      })
    );
    expect(context.actions).toContainEqual(
      expect.objectContaining({
        action: "APPROVE_AWARD",
        allowed: false
      })
    );
  });
});

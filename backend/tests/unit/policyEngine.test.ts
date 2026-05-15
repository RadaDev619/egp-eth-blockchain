import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../src/types/domain.js";
import { permissions } from "../../src/types/domain.js";

const db = vi.hoisted(() => ({
  tenders: [] as Array<Record<string, unknown>>,
  assignments: [] as Array<Record<string, unknown>>,
  stakeholders: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
  reset() {
    this.tenders.length = 0;
    this.assignments.length = 0;
    this.stakeholders.length = 0;
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
        const matches = db.assignments.find((assignment) => {
          const stakeholder = db.stakeholders.find((candidate) => candidate.id === assignment.stakeholderId);
          const stakeholderMatches =
            !where.stakeholder ||
            where.stakeholder.OR.some(
              (condition: Record<string, string>) =>
                ("userId" in condition && stakeholder?.userId === condition.userId) ||
                ("employeeHash" in condition && stakeholder?.employeeHash === condition.employeeHash)
            );

          return (
            assignment.tenderId === where.tenderId &&
            (!where.role || assignment.role === where.role) &&
            (!where.status || assignment.status === where.status) &&
            stakeholderMatches
          );
        });

        if (!matches) {
          return null;
        }

        if (where.select) {
          return { id: matches.id };
        }

        return includeStakeholder(matches);
      })
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

const { assertTenderPolicy } = await import("../../src/services/policyEngine.js");

const baseUser = {
  profileId: "profile",
  holderDID: "did:key:mock",
  employmentId: "PROC-001",
  employer: "Ministry of Finance",
  position: "Procurement Officer",
  employmentType: "Regular"
};

const procurementOfficer: AuthenticatedUser = {
  ...baseUser,
  userId: "proc-user",
  employeeHash: "0xproc",
  role: "PROCUREMENT_OFFICER",
  permissions: [permissions.CREATE_TENDER, permissions.MANAGE_TENDER_ASSIGNMENTS, permissions.VIEW_ASSIGNED_TENDERS]
};

const vendor: AuthenticatedUser = {
  ...baseUser,
  userId: "vendor-user",
  employmentId: "VEND-001",
  employer: "Demo Vendor Pvt Ltd",
  position: "Vendor Representative",
  employeeHash: "0xvendor",
  role: "VENDOR",
  permissions: [permissions.SUBMIT_BID]
};

describe("policyEngine", () => {
  beforeEach(() => {
    db.reset();
    db.tenders.push({
      id: "tender-1",
      tenderCode: "TDR-POLICY-001",
      currentState: "PUBLISHED",
      createdByEmployeeHash: "0xproc",
      createdByRole: "PROCUREMENT_OFFICER"
    });
    db.stakeholders.push(
      {
        id: "stakeholder-proc",
        userId: "proc-user",
        employeeHash: "0xproc",
        stakeholderType: "PROCURING_AGENCY"
      },
      {
        id: "stakeholder-vendor",
        userId: "vendor-user",
        employeeHash: "0xvendor",
        stakeholderType: "VENDOR"
      }
    );
    db.assignments.push({
      id: "assignment-proc",
      tenderId: "tender-1",
      stakeholderId: "stakeholder-proc",
      role: "PROCUREMENT_OFFICER",
      status: "ACTIVE"
    });
  });

  it("allows a user only when their backend session role has an active tender assignment", async () => {
    const decision = await assertTenderPolicy({
      user: procurementOfficer,
      tenderId: "tender-1",
      action: "MANAGE_TENDER_ASSIGNMENTS",
      requiredPermission: permissions.MANAGE_TENDER_ASSIGNMENTS,
      allowedRoles: ["PROCUREMENT_OFFICER"],
      allowedStates: ["PUBLISHED"]
    });

    expect(decision.allowed).toBe(true);
    expect(decision.assignment).toMatchObject({
      id: "assignment-proc",
      role: "PROCUREMENT_OFFICER"
    });
    expect(db.auditLogs).toHaveLength(0);
  });

  it("rejects an unassigned user even if the global role has a permission", async () => {
    await expect(
      assertTenderPolicy({
        user: vendor,
        tenderId: "tender-1",
        action: "SUBMIT_PROPOSAL_PACKAGE",
        requiredPermission: permissions.SUBMIT_PROPOSAL_PACKAGE,
        allowedRoles: ["VENDOR"],
        allowedStates: ["PUBLISHED"]
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "AUTHORIZATION_ERROR"
    });

    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "UNAUTHORIZED_ACTION_ATTEMPTED",
      status: "BLOCKED",
      actorRole: "VENDOR",
      actorEmployeeHash: "0xvendor",
      rejectionReason: "TENDER_ASSIGNMENT_REQUIRED",
      permissionChecked: permissions.SUBMIT_PROPOSAL_PACKAGE
    });
  });

  it("ignores frontend role tampering and evaluates only the backend session role", async () => {
    await expect(
      assertTenderPolicy({
        user: vendor,
        tenderId: "tender-1",
        action: "MANAGE_TENDER_ASSIGNMENTS",
        requiredPermission: permissions.MANAGE_TENDER_ASSIGNMENTS,
        allowedRoles: ["PROCUREMENT_OFFICER"],
        allowedStates: ["PUBLISHED"],
        metadata: {
          frontendSubmittedRole: "PROCUREMENT_OFFICER"
        }
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "AUTHORIZATION_ERROR"
    });

    expect(db.auditLogs.at(-1)).toMatchObject({
      actorRole: "VENDOR",
      actorEmployeeHash: "0xvendor",
      rejectionReason: "PERMISSION_MISSING"
    });
    expect(JSON.stringify(db.auditLogs.at(-1))).toContain("frontendSubmittedRole");
  });
});

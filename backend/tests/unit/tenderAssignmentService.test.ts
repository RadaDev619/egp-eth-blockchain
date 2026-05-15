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

function stakeholderForAssignment(assignment: Record<string, unknown>) {
  return db.stakeholders.find((stakeholder) => stakeholder.id === assignment.stakeholderId) ?? null;
}

function includeStakeholder(assignment: Record<string, unknown>) {
  return {
    ...assignment,
    stakeholder: stakeholderForAssignment(assignment)
  };
}

vi.mock("../../src/utils/prisma.js", () => {
  const prisma = {
    tender: {
      findUnique: vi.fn(async ({ where }) => db.tenders.find((tender) => tender.id === where.id) ?? null)
    },
    stakeholder: {
      findUnique: vi.fn(async ({ where }) => db.stakeholders.find((stakeholder) => stakeholder.id === where.id) ?? null)
    },
    tenderRoleAssignment: {
      findFirst: vi.fn(async ({ where }) => {
        const assignment = db.assignments.find((candidate) => {
          const stakeholder = stakeholderForAssignment(candidate);
          const stakeholderMatches =
            !where.stakeholder ||
            where.stakeholder.OR.some(
              (condition: Record<string, string>) =>
                ("userId" in condition && stakeholder?.userId === condition.userId) ||
                ("employeeHash" in condition && stakeholder?.employeeHash === condition.employeeHash)
            );

          return (
            (!where.id || candidate.id === where.id) &&
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
      ),
      upsert: vi.fn(async ({ where, update, create }) => {
        const compound = where.tenderId_stakeholderId_role;
        let assignment = db.assignments.find(
          (candidate) =>
            candidate.tenderId === compound.tenderId &&
            candidate.stakeholderId === compound.stakeholderId &&
            candidate.role === compound.role
        );

        if (assignment) {
          Object.assign(assignment, update);
        } else {
          const createdAssignment = {
            id: `assignment-${db.assignments.length + 1}`,
            assignedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create
          };
          db.assignments.push(createdAssignment);
          assignment = createdAssignment;
        }

        if (!assignment) {
          throw new Error("Assignment upsert failed.");
        }

        return includeStakeholder(assignment);
      }),
      update: vi.fn(async ({ where, data }) => {
        const assignment = db.assignments.find((candidate) => candidate.id === where.id);

        if (!assignment) {
          throw new Error("Assignment update failed.");
        }

        Object.assign(assignment, data);
        return includeStakeholder(assignment);
      })
    },
    auditLog: {
      create: vi.fn(async ({ data }) => {
        const audit = { id: `audit-${db.auditLogs.length + 1}`, createdAt: new Date(), ...data };
        db.auditLogs.push(audit);
        return audit;
      })
    },
    $transaction: vi.fn(async (callback) => callback(prisma))
  };

  return { prisma };
});

const { assignTenderRole } = await import("../../src/services/tenderAssignmentService.js");

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
  permissions: [permissions.MANAGE_TENDER_ASSIGNMENTS]
};

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
  permissions: [permissions.SUBMIT_BID]
};

describe("tenderAssignmentService", () => {
  beforeEach(() => {
    db.reset();
    db.tenders.push({
      id: "tender-1",
      tenderCode: "TDR-ASSIGN-001",
      currentState: "DRAFT",
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
  });

  it("lets the tender creator bootstrap assignment management without trusting frontend actorRole", async () => {
    const assignment = await assignTenderRole(
      {
        tenderId: "tender-1",
        stakeholderId: "stakeholder-vendor",
        role: "VENDOR",
        metadata: {
          frontendSubmittedActorRole: "AUDITOR"
        }
      },
      procurementOfficer
    );

    expect(assignment).toMatchObject({
      tenderId: "tender-1",
      stakeholderId: "stakeholder-vendor",
      role: "VENDOR",
      status: "ACTIVE",
      assignedByEmployeeHash: "0xproc"
    });
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "TENDER_ROLE_ASSIGNED",
      status: "SUCCESS",
      actorRole: "PROCUREMENT_OFFICER",
      actorEmployeeHash: "0xproc",
      permissionChecked: permissions.MANAGE_TENDER_ASSIGNMENTS
    });
    expect(JSON.stringify(db.auditLogs.at(-1))).not.toContain("PROC-001");
  });

  it("blocks non-procurement roles from assigning tender roles", async () => {
    await expect(
      assignTenderRole(
        {
          tenderId: "tender-1",
          stakeholderId: "stakeholder-vendor",
          role: "VENDOR"
        },
        vendor
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "AUTHORIZATION_ERROR"
    });

    expect(db.assignments).toHaveLength(0);
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "UNAUTHORIZED_ACTION_ATTEMPTED",
      actorRole: "VENDOR",
      actorEmployeeHash: "0xvendor",
      rejectionReason: "PERMISSION_MISSING"
    });
  });
});

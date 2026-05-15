import type { Prisma, Role, TenderAssignmentStatus } from "@prisma/client";
import { appendAuditEvent, actorAuditFields } from "./auditService.js";
import { assertTenderPolicy, type PolicyContext } from "./policyEngine.js";
import { permissions, type AuthenticatedUser } from "../types/domain.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { prisma } from "../utils/prisma.js";

type TenderAssignmentClient = typeof prisma | Prisma.TransactionClient;

export type AssignTenderRoleInput = {
  tenderId: string;
  stakeholderId: string;
  role: Role;
  metadata?: Prisma.InputJsonValue;
};

export type RevokeTenderRoleInput = {
  tenderId: string;
  assignmentId: string;
  reason?: string | null;
};

function requestAuditFields(context?: PolicyContext) {
  return {
    route: context?.route,
    httpMethod: context?.httpMethod,
    requestId: context?.requestId
  };
}

async function findTenderOrThrow(tenderId: string, client: TenderAssignmentClient = prisma) {
  const tender = await client.tender.findUnique({
    where: { id: tenderId },
    select: {
      id: true,
      tenderCode: true,
      currentState: true,
      createdByEmployeeHash: true,
      createdByRole: true
    }
  });

  if (!tender) {
    throw new NotFoundError("Tender was not found.");
  }

  return tender;
}

async function findStakeholderOrThrow(stakeholderId: string, client: TenderAssignmentClient = prisma) {
  const stakeholder = await client.stakeholder.findUnique({
    where: { id: stakeholderId }
  });

  if (!stakeholder) {
    throw new NotFoundError("Stakeholder was not found.");
  }

  return stakeholder;
}

function assertAssignableRole(role: Role) {
  const assignableRoles: Role[] = [
    "PROCUREMENT_OFFICER",
    "VENDOR",
    "EVALUATOR",
    "FINANCE_OFFICER",
    "AUDITOR",
    "TEC_MEMBER",
    "TEC_CHAIR",
    "APPROVING_OFFICER",
    "FINANCIAL_INSTITUTION_OFFICER"
  ];

  if (!assignableRoles.includes(role)) {
    throw new ValidationError("Tender assignment role is not supported.", { role });
  }
}

export async function listTenderAssignments(tenderId: string, user: AuthenticatedUser, context: PolicyContext = {}) {
  await assertTenderPolicy({
    user,
    tenderId,
    action: "VIEW_TENDER_ASSIGNMENTS",
    requiredPermission: permissions.VIEW_ASSIGNED_TENDERS,
    allowedRoles: [
      "PROCUREMENT_OFFICER",
      "EVALUATOR",
      "FINANCE_OFFICER",
      "AUDITOR",
      "TEC_MEMBER",
      "TEC_CHAIR",
      "APPROVING_OFFICER",
      "FINANCIAL_INSTITUTION_OFFICER"
    ],
    requireAssignment: user.role !== "AUDITOR",
    context
  });

  return prisma.tenderRoleAssignment.findMany({
    where: { tenderId },
    orderBy: [{ role: "asc" }, { assignedAt: "asc" }],
    include: {
      stakeholder: true
    }
  });
}

export async function assignTenderRole(
  input: AssignTenderRoleInput,
  user: AuthenticatedUser,
  context: PolicyContext = {}
) {
  assertAssignableRole(input.role);
  const tender = await findTenderOrThrow(input.tenderId);

  await assertTenderPolicy({
    user,
    tenderId: tender.id,
    action: "MANAGE_TENDER_ASSIGNMENTS",
    requiredPermission: permissions.MANAGE_TENDER_ASSIGNMENTS,
    allowedRoles: ["PROCUREMENT_OFFICER"],
    allowedStates: ["DRAFT", "PUBLICATION_PENDING", "PUBLISHED", "CREATED", "OPEN_FOR_PROPOSALS", "OPEN_FOR_BIDS"],
    context,
    metadata: {
      assignedRole: input.role,
      stakeholderId: input.stakeholderId
    }
  });
  const stakeholder = await findStakeholderOrThrow(input.stakeholderId);

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.tenderRoleAssignment.upsert({
      where: {
        tenderId_stakeholderId_role: {
          tenderId: tender.id,
          stakeholderId: stakeholder.id,
          role: input.role
        }
      },
      update: {
        status: "ACTIVE" satisfies TenderAssignmentStatus,
        assignedByEmployeeHash: user.employeeHash,
        activatedAt: new Date(),
        revokedAt: null,
        metadata: input.metadata ?? undefined
      },
      create: {
        tenderId: tender.id,
        stakeholderId: stakeholder.id,
        role: input.role,
        status: "ACTIVE",
        assignedByEmployeeHash: user.employeeHash,
        activatedAt: new Date(),
        metadata: input.metadata ?? undefined
      },
      include: {
        stakeholder: true
      }
    });

    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "TENDER_ROLE_ASSIGNED",
        status: "SUCCESS",
        resourceType: "TENDER_ASSIGNMENT",
        resourceId: assignment.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        permissionChecked: permissions.MANAGE_TENDER_ASSIGNMENTS,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        metadata: {
          assignedRole: input.role,
          stakeholderId: stakeholder.id,
          stakeholderType: stakeholder.stakeholderType,
          assigneeEmployeeHash: stakeholder.employeeHash,
          assignmentMetadata: input.metadata ?? null
        }
      },
      tx
    );

    return assignment;
  });
}

export async function revokeTenderRole(
  input: RevokeTenderRoleInput,
  user: AuthenticatedUser,
  context: PolicyContext = {}
) {
  const tender = await findTenderOrThrow(input.tenderId);
  const existing = await prisma.tenderRoleAssignment.findFirst({
    where: {
      id: input.assignmentId,
      tenderId: tender.id
    },
    include: {
      stakeholder: true
    }
  });

  if (!existing) {
    throw new NotFoundError("Tender assignment was not found.");
  }

  await assertTenderPolicy({
    user,
    tenderId: tender.id,
    action: "MANAGE_TENDER_ASSIGNMENTS",
    requiredPermission: permissions.MANAGE_TENDER_ASSIGNMENTS,
    allowedRoles: ["PROCUREMENT_OFFICER"],
    allowedStates: ["DRAFT", "PUBLICATION_PENDING", "PUBLISHED", "CREATED", "OPEN_FOR_PROPOSALS", "OPEN_FOR_BIDS"],
    context,
    metadata: {
      revokedRole: existing.role,
      assignmentId: existing.id
    }
  });

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.tenderRoleAssignment.update({
      where: { id: existing.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        metadata: {
          ...(existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
            ? existing.metadata
            : {}),
          revokeReason: input.reason ?? null
        }
      },
      include: {
        stakeholder: true
      }
    });

    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "TENDER_ROLE_REVOKED",
        status: "SUCCESS",
        resourceType: "TENDER_ASSIGNMENT",
        resourceId: assignment.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        permissionChecked: permissions.MANAGE_TENDER_ASSIGNMENTS,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        rejectionReason: input.reason ?? null,
        metadata: {
          revokedRole: assignment.role,
          stakeholderId: assignment.stakeholderId,
          assigneeEmployeeHash: assignment.stakeholder.employeeHash
        }
      },
      tx
    );

    return assignment;
  });
}

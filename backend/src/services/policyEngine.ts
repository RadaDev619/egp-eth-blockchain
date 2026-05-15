import type { Prisma, Role, TenderAssignmentStatus, TenderState } from "@prisma/client";
import { actorAuditFields, logUnauthorizedAttempt } from "./auditService.js";
import { hasPermission } from "./rbacService.js";
import type { AuthenticatedUser, Permission } from "../types/domain.js";
import { AuthorizationError, InvalidTransitionError, NotFoundError } from "../utils/errors.js";
import { prisma } from "../utils/prisma.js";

type PolicyClient = typeof prisma | Prisma.TransactionClient;

export type PolicyContext = {
  route?: string;
  httpMethod?: string;
  requestId?: string;
};

export type TenderPolicyInput = {
  user: AuthenticatedUser;
  tenderId: string;
  action: string;
  requiredPermission: Permission;
  allowedRoles?: Role[];
  allowedStates?: TenderState[];
  requireAssignment?: boolean;
  context?: PolicyContext;
  metadata?: Prisma.InputJsonValue;
};

export type TenderPolicyDecision = {
  allowed: boolean;
  statusCode?: 403 | 409;
  reason?: string;
  tender?: Awaited<ReturnType<typeof findTenderForPolicy>>;
  assignment?: Awaited<ReturnType<typeof findActiveTenderAssignment>>;
};

function requestAuditFields(context?: PolicyContext) {
  return {
    route: context?.route,
    httpMethod: context?.httpMethod,
    requestId: context?.requestId
  };
}

async function findTenderForPolicy(tenderId: string, client: PolicyClient = prisma) {
  return client.tender.findUnique({
    where: { id: tenderId },
    select: {
      id: true,
      tenderCode: true,
      currentState: true,
      createdByEmployeeHash: true,
      createdByRole: true
    }
  });
}

export async function findActiveTenderAssignment(
  tenderId: string,
  user: AuthenticatedUser,
  client: PolicyClient = prisma
) {
  return client.tenderRoleAssignment.findFirst({
    where: {
      tenderId,
      role: user.role,
      status: "ACTIVE" satisfies TenderAssignmentStatus,
      stakeholder: {
        OR: [{ userId: user.userId }, { employeeHash: user.employeeHash }]
      }
    },
    include: {
      stakeholder: true
    }
  });
}

function creatorCanBootstrapAssignment(input: TenderPolicyInput, tender: NonNullable<TenderPolicyDecision["tender"]>) {
  return (
    input.action === "MANAGE_TENDER_ASSIGNMENTS" &&
    input.user.employeeHash === tender.createdByEmployeeHash &&
    input.user.role === tender.createdByRole
  );
}

async function hasAnyTenderAssignments(tenderId: string, client: PolicyClient = prisma) {
  const assignment = await client.tenderRoleAssignment.findFirst({
    where: { tenderId },
    select: { id: true }
  });

  return Boolean(assignment);
}

async function logPolicyRejection(input: TenderPolicyInput, decision: TenderPolicyDecision) {
  await logUnauthorizedAttempt({
    ...actorAuditFields(input.user),
    ...requestAuditFields(input.context),
    resourceType: "TENDER_POLICY",
    resourceId: input.tenderId,
    tenderId: input.tenderId,
    fromState: decision.tender?.currentState ?? null,
    permissionChecked: input.requiredPermission,
    rejectionReason: decision.reason,
    metadata: {
      action: input.action,
      requiredPermission: input.requiredPermission,
      allowedRoles: input.allowedRoles ?? null,
      allowedStates: input.allowedStates ?? null,
      policyMetadata: input.metadata ?? null
    }
  });
}

export async function evaluateTenderPolicy(
  input: TenderPolicyInput,
  client: PolicyClient = prisma
): Promise<TenderPolicyDecision> {
  const tender = await findTenderForPolicy(input.tenderId, client);

  if (!tender) {
    throw new NotFoundError("Tender was not found.");
  }

  if (!hasPermission(input.user.role, input.requiredPermission)) {
    return {
      allowed: false,
      statusCode: 403,
      reason: "PERMISSION_MISSING",
      tender
    };
  }

  if (input.allowedRoles?.length && !input.allowedRoles.includes(input.user.role)) {
    return {
      allowed: false,
      statusCode: 403,
      reason: "ROLE_NOT_ALLOWED",
      tender
    };
  }

  if (input.allowedStates?.length && !input.allowedStates.includes(tender.currentState)) {
    return {
      allowed: false,
      statusCode: 409,
      reason: "TENDER_STATE_NOT_ALLOWED",
      tender
    };
  }

  if (input.requireAssignment === false) {
    return { allowed: true, tender };
  }

  const assignment = await findActiveTenderAssignment(input.tenderId, input.user, client);

  if (assignment) {
    return {
      allowed: true,
      tender,
      assignment
    };
  }

  const hasAssignments = await hasAnyTenderAssignments(input.tenderId, client);

  if (!hasAssignments && creatorCanBootstrapAssignment(input, tender)) {
    return { allowed: true, tender };
  }

  return {
    allowed: false,
    statusCode: 403,
    reason: "TENDER_ASSIGNMENT_REQUIRED",
    tender
  };
}

export async function assertTenderPolicy(input: TenderPolicyInput, client: PolicyClient = prisma) {
  const decision = await evaluateTenderPolicy(input, client);

  if (decision.allowed) {
    return decision;
  }

  await logPolicyRejection(input, decision);

  if (decision.statusCode === 409) {
    throw new InvalidTransitionError("Tender stage policy rejected this action.", decision);
  }

  throw new AuthorizationError("Your verified identity is not assigned to this tender action.", decision);
}

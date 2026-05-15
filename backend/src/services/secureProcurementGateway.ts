import type { Prisma, Role, TenderState } from "@prisma/client";
import { appendAuditEvent, actorAuditFields } from "./auditService.js";
import { assertTenderPolicy, evaluateTenderPolicy, type PolicyContext } from "./policyEngine.js";
import { permissions, type AuthenticatedUser, type Permission } from "../types/domain.js";
import { ValidationError } from "../utils/errors.js";
import { canonicalJson, sha256Hex } from "../utils/hash.js";
import { prisma } from "../utils/prisma.js";

type GatewayClient = typeof prisma | Prisma.TransactionClient;

export const SecureGatewayAction = {
  CREATE_TENDER_MANIFEST: "CREATE_TENDER_MANIFEST",
  REQUEST_PUBLICATION_APPROVAL: "REQUEST_PUBLICATION_APPROVAL",
  APPROVE_TENDER_PUBLICATION: "APPROVE_TENDER_PUBLICATION",
  SUBMIT_PROPOSAL_PACKAGE: "SUBMIT_PROPOSAL_PACKAGE",
  COMMIT_PROPOSAL_ENVELOPE: "COMMIT_PROPOSAL_ENVELOPE",
  CLOSE_TENDER: "CLOSE_TENDER",
  REQUEST_KEY_RELEASE: "REQUEST_KEY_RELEASE",
  RELEASE_ENVELOPE_KEY: "RELEASE_ENVELOPE_KEY",
  DECLARE_CONFLICT_OF_INTEREST: "DECLARE_CONFLICT_OF_INTEREST",
  SUBMIT_EVALUATION_REPORT: "SUBMIT_EVALUATION_REPORT",
  SUBMIT_AWARD_RECOMMENDATION: "SUBMIT_AWARD_RECOMMENDATION",
  APPROVE_AWARD: "APPROVE_AWARD",
  COMMIT_CONTRACT_HASH: "COMMIT_CONTRACT_HASH",
  ARCHIVE_TENDER: "ARCHIVE_TENDER"
} as const;

export type SecureGatewayActionValue = (typeof SecureGatewayAction)[keyof typeof SecureGatewayAction];

type GatewayActionPolicy = {
  action: SecureGatewayActionValue;
  permission: Permission;
  allowedRoles: Role[];
  allowedStates: TenderState[];
  requireAssignment: boolean;
  requiredHashFields?: string[];
};

export type GatewayActionInput = {
  tenderId: string;
  action: SecureGatewayActionValue;
  metadata?: Prisma.InputJsonValue;
};

export type GatewayExecutionInput<T> = GatewayActionInput & {
  user: AuthenticatedUser;
  context?: PolicyContext;
  operation: (input: {
    policy: Awaited<ReturnType<typeof assertSecureGatewayAction>>;
    metadataHash: string | null;
  }) => Promise<T>;
};

const secureGatewayPolicies = {
  CREATE_TENDER_MANIFEST: {
    action: SecureGatewayAction.CREATE_TENDER_MANIFEST,
    permission: permissions.CREATE_TENDER_MANIFEST,
    allowedRoles: ["PROCUREMENT_OFFICER"],
    allowedStates: ["DRAFT", "CREATED", "PUBLICATION_PENDING"],
    requireAssignment: true,
    requiredHashFields: ["manifestHash"]
  },
  REQUEST_PUBLICATION_APPROVAL: {
    action: SecureGatewayAction.REQUEST_PUBLICATION_APPROVAL,
    permission: permissions.REQUEST_PUBLICATION_APPROVAL,
    allowedRoles: ["PROCUREMENT_OFFICER"],
    allowedStates: ["DRAFT", "CREATED"],
    requireAssignment: true,
    requiredHashFields: ["manifestHash"]
  },
  APPROVE_TENDER_PUBLICATION: {
    action: SecureGatewayAction.APPROVE_TENDER_PUBLICATION,
    permission: permissions.APPROVE_TENDER_PUBLICATION,
    allowedRoles: ["APPROVING_OFFICER"],
    allowedStates: ["PUBLICATION_PENDING"],
    requireAssignment: true,
    requiredHashFields: ["manifestHash", "signatureHash"]
  },
  SUBMIT_PROPOSAL_PACKAGE: {
    action: SecureGatewayAction.SUBMIT_PROPOSAL_PACKAGE,
    permission: permissions.SUBMIT_PROPOSAL_PACKAGE,
    allowedRoles: ["VENDOR"],
    allowedStates: ["PUBLISHED", "OPEN_FOR_PROPOSALS"],
    requireAssignment: true,
    requiredHashFields: ["packageHash"]
  },
  COMMIT_PROPOSAL_ENVELOPE: {
    action: SecureGatewayAction.COMMIT_PROPOSAL_ENVELOPE,
    permission: permissions.COMMIT_PROPOSAL_ENVELOPE,
    allowedRoles: ["VENDOR"],
    allowedStates: ["PUBLISHED", "OPEN_FOR_PROPOSALS"],
    requireAssignment: true,
    requiredHashFields: ["encryptedFileHash", "envelopeManifestHash"]
  },
  CLOSE_TENDER: {
    action: SecureGatewayAction.CLOSE_TENDER,
    permission: permissions.CLOSE_TENDER,
    allowedRoles: ["PROCUREMENT_OFFICER"],
    allowedStates: ["PUBLISHED", "OPEN_FOR_PROPOSALS"],
    requireAssignment: true
  },
  REQUEST_KEY_RELEASE: {
    action: SecureGatewayAction.REQUEST_KEY_RELEASE,
    permission: permissions.REQUEST_KEY_RELEASE,
    allowedRoles: ["TEC_MEMBER", "TEC_CHAIR", "FINANCIAL_INSTITUTION_OFFICER"],
    allowedStates: ["TECHNICAL_EVALUATION", "FINANCIAL_EVALUATION", "AWARD_APPROVED"],
    requireAssignment: true,
    requiredHashFields: ["envelopeManifestHash"]
  },
  RELEASE_ENVELOPE_KEY: {
    action: SecureGatewayAction.RELEASE_ENVELOPE_KEY,
    permission: permissions.RELEASE_ENVELOPE_KEY,
    allowedRoles: ["TEC_CHAIR", "FINANCIAL_INSTITUTION_OFFICER"],
    allowedStates: ["TECHNICAL_EVALUATION", "FINANCIAL_EVALUATION", "AWARD_APPROVED"],
    requireAssignment: true,
    requiredHashFields: ["envelopeManifestHash"]
  },
  DECLARE_CONFLICT_OF_INTEREST: {
    action: SecureGatewayAction.DECLARE_CONFLICT_OF_INTEREST,
    permission: permissions.DECLARE_CONFLICT_OF_INTEREST,
    allowedRoles: ["TEC_MEMBER", "TEC_CHAIR", "FINANCIAL_INSTITUTION_OFFICER"],
    allowedStates: ["PUBLISHED", "CLOSED", "TECHNICAL_EVALUATION", "FINANCIAL_EVALUATION"],
    requireAssignment: true,
    requiredHashFields: ["declarationHash"]
  },
  SUBMIT_EVALUATION_REPORT: {
    action: SecureGatewayAction.SUBMIT_EVALUATION_REPORT,
    permission: permissions.SUBMIT_EVALUATION_REPORT,
    allowedRoles: ["TEC_MEMBER", "TEC_CHAIR"],
    allowedStates: ["TECHNICAL_EVALUATION", "FINANCIAL_EVALUATION"],
    requireAssignment: true,
    requiredHashFields: ["reportHash"]
  },
  SUBMIT_AWARD_RECOMMENDATION: {
    action: SecureGatewayAction.SUBMIT_AWARD_RECOMMENDATION,
    permission: permissions.SUBMIT_AWARD_RECOMMENDATION,
    allowedRoles: ["TEC_CHAIR"],
    allowedStates: ["FINANCIAL_EVALUATION", "AWARD_RECOMMENDED"],
    requireAssignment: true,
    requiredHashFields: ["recommendationHash"]
  },
  APPROVE_AWARD: {
    action: SecureGatewayAction.APPROVE_AWARD,
    permission: permissions.APPROVE_AWARD,
    allowedRoles: ["APPROVING_OFFICER"],
    allowedStates: ["AWARD_RECOMMENDED"],
    requireAssignment: true,
    requiredHashFields: ["recommendationHash", "signatureHash"]
  },
  COMMIT_CONTRACT_HASH: {
    action: SecureGatewayAction.COMMIT_CONTRACT_HASH,
    permission: permissions.COMMIT_CONTRACT_HASH,
    allowedRoles: ["PROCUREMENT_OFFICER", "APPROVING_OFFICER"],
    allowedStates: ["AWARD_APPROVED", "CONTRACT_SIGNED"],
    requireAssignment: true,
    requiredHashFields: ["contractHash"]
  },
  ARCHIVE_TENDER: {
    action: SecureGatewayAction.ARCHIVE_TENDER,
    permission: permissions.ARCHIVE_TENDER,
    allowedRoles: ["PROCUREMENT_OFFICER"],
    allowedStates: ["CONTRACT_SIGNED"],
    requireAssignment: true
  }
} as const satisfies Record<SecureGatewayActionValue, GatewayActionPolicy>;

const forbiddenMetadataKeys = new Set([
  "employmentId",
  "rawEmploymentId",
  "salary",
  "privateKey",
  "relayerPrivateKey",
  "deployerPrivateKey",
  "ndiClientSecret",
  "jwtSecret",
  "employeeHashSalt"
]);

const hashPattern = /^0x[a-fA-F0-9]{64}$/;

function requestAuditFields(context?: PolicyContext) {
  return {
    route: context?.route,
    httpMethod: context?.httpMethod,
    requestId: context?.requestId
  };
}

export function getSecureGatewayPolicy(action: SecureGatewayActionValue): GatewayActionPolicy {
  return secureGatewayPolicies[action] as GatewayActionPolicy;
}

export function listSecureGatewayPolicies() {
  return (Object.values(secureGatewayPolicies) as GatewayActionPolicy[]).map((policy) => ({
    action: policy.action,
    permission: policy.permission,
    allowedRoles: policy.allowedRoles,
    allowedStates: policy.allowedStates,
    requireAssignment: policy.requireAssignment,
    requiredHashFields: policy.requiredHashFields ?? []
  }));
}

function metadataObject(metadata: Prisma.InputJsonValue | undefined): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  if (Array.isArray(metadata) || typeof metadata !== "object") {
    throw new ValidationError("Secure gateway metadata must be an object.");
  }

  return metadata as Record<string, unknown>;
}

function findForbiddenMetadataPath(value: unknown, path: string[] = []): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const nested = findForbiddenMetadataPath(item, [...path, String(index)]);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (forbiddenMetadataKeys.has(key)) {
      return [...path, key].join(".");
    }

    const nested = findForbiddenMetadataPath(nestedValue, [...path, key]);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function assertHashField(metadata: Record<string, unknown>, field: string) {
  const value = metadata[field];

  if (typeof value !== "string" || !hashPattern.test(value)) {
    throw new ValidationError("Secure gateway hash commitment is missing or invalid.", {
      field,
      expectedFormat: "0x-prefixed SHA-256 hex"
    });
  }
}

function validateGatewayMetadata(policy: GatewayActionPolicy, metadata: Prisma.InputJsonValue | undefined) {
  const objectMetadata = metadataObject(metadata);
  const forbiddenPath = findForbiddenMetadataPath(objectMetadata);

  if (forbiddenPath) {
    throw new ValidationError("Secure gateway metadata contains sensitive or forbidden fields.", {
      field: forbiddenPath
    });
  }

  for (const field of policy.requiredHashFields ?? []) {
    assertHashField(objectMetadata, field);
  }

  return {
    metadata: objectMetadata,
    metadataHash: Object.keys(objectMetadata).length > 0 ? `0x${sha256Hex(canonicalJson(objectMetadata))}` : null
  };
}

export async function getSecureGatewayContext(tenderId: string, user: AuthenticatedUser, context: PolicyContext = {}) {
  const assignments = await prisma.tenderRoleAssignment.findMany({
    where: { tenderId },
    orderBy: [{ role: "asc" }, { assignedAt: "asc" }],
    include: {
      stakeholder: true
    }
  });
  const userAssignment = assignments.find(
    (assignment) =>
      assignment.status === "ACTIVE" &&
      assignment.role === user.role &&
      (assignment.stakeholder.userId === user.userId || assignment.stakeholder.employeeHash === user.employeeHash)
  );

  const decisions = await Promise.all(
    (Object.values(secureGatewayPolicies) as GatewayActionPolicy[]).map(async (policy) => {
      const decision = await evaluateTenderPolicy(
        {
          user,
          tenderId,
          action: policy.action,
          requiredPermission: policy.permission,
          allowedRoles: [...policy.allowedRoles],
          allowedStates: [...policy.allowedStates],
          requireAssignment: policy.requireAssignment,
          context
        },
        prisma
      );

      return {
        action: policy.action,
        allowed: decision.allowed,
        reason: decision.reason ?? null,
        requiredPermission: policy.permission,
        requiredHashFields: policy.requiredHashFields ?? []
      };
    })
  );

  return {
    tenderId,
    userRole: user.role,
    userEmployeeHash: user.employeeHash,
    assignment: userAssignment ?? null,
    assignments,
    actions: decisions
  };
}

export async function assertSecureGatewayAction(
  input: GatewayActionInput & { user: AuthenticatedUser; context?: PolicyContext },
  client: GatewayClient = prisma
) {
  const policy = getSecureGatewayPolicy(input.action);
  const metadataValidation = validateGatewayMetadata(policy, input.metadata);
  const decision = await assertTenderPolicy(
    {
      user: input.user,
      tenderId: input.tenderId,
      action: policy.action,
      requiredPermission: policy.permission,
      allowedRoles: [...policy.allowedRoles],
      allowedStates: [...policy.allowedStates],
      requireAssignment: policy.requireAssignment,
      context: input.context,
      metadata: {
        metadataHash: metadataValidation.metadataHash,
        requiredHashFields: policy.requiredHashFields ?? []
      }
    },
    client
  );

  return {
    policy,
    decision,
    metadataHash: metadataValidation.metadataHash,
    metadata: metadataValidation.metadata
  };
}

export async function checkSecureGatewayAction(
  input: GatewayActionInput,
  user: AuthenticatedUser,
  context: PolicyContext = {}
) {
  try {
    const result = await assertSecureGatewayAction({ ...input, user, context });

    await appendAuditEvent({
      ...actorAuditFields(user),
      ...requestAuditFields(context),
      action: "SECURE_GATEWAY_POLICY_VALIDATED",
      status: "SUCCESS",
      resourceType: "SECURE_GATEWAY_ACTION",
      resourceId: input.action,
      tenderId: input.tenderId,
      fromState: result.decision.tender?.currentState ?? null,
      permissionChecked: result.policy.permission,
      permissionResult: "ALLOWED",
      transitionAllowed: true,
      metadata: {
        gatewayAction: input.action,
        gatewayMetadataHash: result.metadataHash,
        requiredHashFields: result.policy.requiredHashFields ?? [],
        assignmentId: result.decision.assignment?.id ?? null
      }
    });

    return {
      allowed: true,
      action: input.action,
      tenderId: input.tenderId,
      tenderState: result.decision.tender?.currentState ?? null,
      assignmentId: result.decision.assignment?.id ?? null,
      metadataHash: result.metadataHash,
      requiredPermission: result.policy.permission,
      requiredHashFields: result.policy.requiredHashFields ?? []
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      await appendAuditEvent({
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "SECURE_GATEWAY_METADATA_REJECTED",
        status: "BLOCKED",
        resourceType: "SECURE_GATEWAY_ACTION",
        resourceId: input.action,
        tenderId: input.tenderId,
        permissionResult: "DENIED",
        transitionAllowed: false,
        rejectionReason: error.code,
        metadata: {
          gatewayAction: input.action,
          validationDetails: error.details ?? null
        }
      });
    }

    throw error;
  }
}

export async function executeSecureGatewayAction<T>(input: GatewayExecutionInput<T>): Promise<T> {
  const policy = await assertSecureGatewayAction(input);

  return input.operation({
    policy,
    metadataHash: policy.metadataHash
  });
}

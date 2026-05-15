import type { Prisma } from "@prisma/client";
import { appendAuditEvent, actorAuditFields } from "./auditService.js";
import { releaseEnvelopeKey, requestEnvelopeKeyRelease } from "./keyManagementService.js";
import { assertSecureGatewayAction, SecureGatewayAction } from "./secureProcurementGateway.js";
import { permissions, type AuthenticatedUser } from "../types/domain.js";
import { AuthorizationError, InvalidTransitionError, NotFoundError, ValidationError } from "../utils/errors.js";
import { prisma } from "../utils/prisma.js";

type FinancialEvaluationClient = typeof prisma | Prisma.TransactionClient;
type FinancialEnvelopeWithRelations = Prisma.ProposalEnvelopeGetPayload<{
  include: {
    fileReferences: true;
    proposalPackage: {
      include: {
        vendorStakeholder: true;
      };
    };
    keyReleaseRequests: true;
  };
}>;

type RequestContext = {
  route?: string;
  httpMethod?: string;
  requestId?: string;
};

export type RequestFinancialKeyReleaseInput = {
  tenderId: string;
  proposalEnvelopeId: string;
};

export type ReleaseFinancialKeyInput = {
  tenderId: string;
  keyReleaseRequestId: string;
};

function requestAuditFields(context: RequestContext) {
  return {
    route: context.route,
    httpMethod: context.httpMethod,
    requestId: context.requestId
  };
}

function assertId(name: string, value: string) {
  if (!value?.trim()) {
    throw new ValidationError(`${name} is required.`, { field: name });
  }
}

async function findTenderOrThrow(tenderId: string, client: FinancialEvaluationClient = prisma) {
  const tender = await client.tender.findUnique({
    where: { id: tenderId }
  });

  if (!tender) {
    throw new NotFoundError("Tender was not found.");
  }

  return tender;
}

async function findFinancialEnvelopeOrThrow(
  tenderId: string,
  proposalEnvelopeId: string,
  client: FinancialEvaluationClient = prisma
) {
  const envelope = await client.proposalEnvelope.findFirst({
    where: {
      id: proposalEnvelopeId,
      envelopeType: "FINANCIAL",
      proposalPackage: {
        tenderId
      }
    },
    include: {
      proposalPackage: {
        include: {
          tender: true
        }
      }
    }
  });

  if (!envelope) {
    throw new NotFoundError("Financial proposal envelope was not found.");
  }

  return envelope;
}

async function findFinancialKeyReleaseRequestOrThrow(
  tenderId: string,
  keyReleaseRequestId: string,
  client: FinancialEvaluationClient = prisma
) {
  const request = await client.keyReleaseRequest.findFirst({
    where: {
      id: keyReleaseRequestId,
      tenderId,
      proposalEnvelope: {
        envelopeType: "FINANCIAL"
      }
    },
    include: {
      proposalEnvelope: true
    }
  });

  if (!request) {
    throw new NotFoundError("Financial key release request was not found.");
  }

  return request;
}

async function conflictDeclarationFor(user: AuthenticatedUser, tenderId: string, client: FinancialEvaluationClient = prisma) {
  return client.conflictOfInterestDeclaration.findUnique({
    where: {
      tenderId_actorEmployeeHash: {
        tenderId,
        actorEmployeeHash: user.employeeHash
      }
    }
  });
}

async function logFinancialAccessBlocked(input: {
  tenderId: string;
  tenderState?: string | null;
  user: AuthenticatedUser;
  context: RequestContext;
  reason: string;
  proposalEnvelopeId?: string | null;
}) {
  await appendAuditEvent({
    ...actorAuditFields(input.user),
    ...requestAuditFields(input.context),
    action: "FINANCIAL_ENVELOPE_ACCESS_BLOCKED",
    status: "BLOCKED",
    resourceType: input.proposalEnvelopeId ? "PROPOSAL_ENVELOPE" : "TENDER",
    resourceId: input.proposalEnvelopeId ?? input.tenderId,
    tenderId: input.tenderId,
    fromState: input.tenderState ?? null,
    permissionChecked: permissions.REQUEST_KEY_RELEASE,
    permissionResult: "DENIED",
    transitionAllowed: false,
    rejectionReason: input.reason,
    metadata: {
      envelopeType: "FINANCIAL"
    }
  });
}

async function assertFinancialEvaluationAccess(
  tenderId: string,
  user: AuthenticatedUser,
  context: RequestContext,
  proposalEnvelopeId?: string | null
) {
  const tender = await findTenderOrThrow(tenderId);
  const declaration = await conflictDeclarationFor(user, tender.id);

  if (declaration?.declarationStatus === "DECLARED_CONFLICT" || declaration?.declarationStatus === "REVIEW_REQUIRED") {
    await logFinancialAccessBlocked({
      tenderId: tender.id,
      tenderState: tender.currentState,
      user,
      context,
      proposalEnvelopeId,
      reason: "CONFLICT_OF_INTEREST_DECLARED"
    });

    throw new AuthorizationError("Committee member has a declared conflict for this tender.", {
      tenderId: tender.id,
      declarationStatus: declaration.declarationStatus
    });
  }

  if (tender.currentState !== "FINANCIAL_EVALUATION") {
    await logFinancialAccessBlocked({
      tenderId: tender.id,
      tenderState: tender.currentState,
      user,
      context,
      proposalEnvelopeId,
      reason: "FINANCIAL_EVALUATION_NOT_STARTED"
    });

    throw new InvalidTransitionError("Financial envelopes are locked until technical evaluation is complete.", {
      tenderId: tender.id,
      currentState: tender.currentState,
      requiredState: "FINANCIAL_EVALUATION"
    });
  }

  await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.REQUEST_KEY_RELEASE,
    user,
    context,
    metadata: {
      envelopeManifestHash: `0x${"0".repeat(64)}`
    }
  });

  return tender;
}

function presenterSafeFinancialEnvelope(envelope: FinancialEnvelopeWithRelations) {
  return {
    id: envelope.id,
    proposalPackageId: envelope.proposalPackageId,
    envelopeType: envelope.envelopeType,
    encryptedFileHash: envelope.encryptedFileHash,
    envelopeManifestHash: envelope.envelopeManifestHash,
    encryptionAlgorithm: envelope.encryptionAlgorithm,
    keyId: envelope.keyId,
    storageReference: envelope.storageReference,
    ipfsCid: envelope.ipfsCid,
    txHash: envelope.txHash,
    blockchainStatus: envelope.blockchainStatus,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
    vendorStakeholder: envelope.proposalPackage.vendorStakeholder,
    fileReferences: envelope.fileReferences.map((fileReference) => ({
      id: fileReference.id,
      storageProvider: fileReference.storageProvider,
      storageKey: fileReference.storageKey,
      encryptedFileHash: fileReference.encryptedFileHash,
      contentType: fileReference.contentType,
      byteSize: fileReference.byteSize,
      originalFilename: fileReference.originalFilename,
      encryptionAlgorithm: fileReference.encryptionAlgorithm,
      createdAt: fileReference.createdAt
    })),
    keyReleaseRequests: envelope.keyReleaseRequests
  };
}

export async function getFinancialEvaluationWorkspace(
  tenderId: string,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  const tender = await assertFinancialEvaluationAccess(tenderId, user, context);
  const envelopes = await prisma.proposalEnvelope.findMany({
    where: {
      envelopeType: "FINANCIAL",
      proposalPackage: {
        tenderId: tender.id
      }
    },
    orderBy: { createdAt: "asc" },
    include: {
      fileReferences: true,
      proposalPackage: {
        include: {
          vendorStakeholder: true
        }
      },
      keyReleaseRequests: {
        where: {
          requesterEmployeeHash: user.employeeHash
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  await appendAuditEvent({
    ...actorAuditFields(user),
    ...requestAuditFields(context),
    action: "FINANCIAL_ENVELOPES_ACCESSED",
    status: "SUCCESS",
    resourceType: "TENDER",
    resourceId: tender.id,
    tenderId: tender.id,
    fromState: tender.currentState,
    permissionChecked: permissions.REQUEST_KEY_RELEASE,
    permissionResult: "ALLOWED",
    transitionAllowed: true,
    metadata: {
      envelopeType: "FINANCIAL",
      envelopeCount: envelopes.length
    }
  });

  return {
    tender,
    envelopes: envelopes.map(presenterSafeFinancialEnvelope)
  };
}

export async function requestFinancialEnvelopeKeyRelease(
  input: RequestFinancialKeyReleaseInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertId("proposalEnvelopeId", input.proposalEnvelopeId);
  const tender = await assertFinancialEvaluationAccess(input.tenderId, user, context, input.proposalEnvelopeId);
  const envelope = await findFinancialEnvelopeOrThrow(tender.id, input.proposalEnvelopeId);

  return requestEnvelopeKeyRelease({ proposalEnvelopeId: envelope.id }, user, context);
}

export async function releaseFinancialEnvelopeKey(
  input: ReleaseFinancialKeyInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertId("keyReleaseRequestId", input.keyReleaseRequestId);
  const tender = await assertFinancialEvaluationAccess(input.tenderId, user, context);
  const request = await findFinancialKeyReleaseRequestOrThrow(tender.id, input.keyReleaseRequestId);

  return releaseEnvelopeKey({ keyReleaseRequestId: request.id }, user, context);
}

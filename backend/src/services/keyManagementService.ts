import type { AuditStatus, BlockchainStatus, Prisma, ProposalEnvelopeType, Role, TenderState } from "@prisma/client";
import { appendAuditEvent, actorAuditFields } from "./auditService.js";
import { createBlockchainTransactionRecord } from "./blockchainTransactionService.js";
import { recordKeyReleaseLogged, type RelayerTransactionResult } from "./relayer.js";
import { assertSecureGatewayAction, SecureGatewayAction } from "./secureProcurementGateway.js";
import { permissions, type AuthenticatedUser } from "../types/domain.js";
import { AppError, AuthorizationError, InvalidTransitionError, NotFoundError, ValidationError } from "../utils/errors.js";
import { canonicalJson, sha256Hex } from "../utils/hash.js";
import { prisma } from "../utils/prisma.js";

type KeyManagementClient = typeof prisma | Prisma.TransactionClient;

type RequestContext = {
  route?: string;
  httpMethod?: string;
  requestId?: string;
};

export type RequestEnvelopeKeyReleaseInput = {
  proposalEnvelopeId: string;
};

export type ReleaseEnvelopeKeyInput = {
  keyReleaseRequestId: string;
};

const policyRejectedReason = "KEY_RELEASE_POLICY_NOT_SATISFIED";

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

function mockKeyMaterialReference(input: {
  keyReleaseRequestId: string;
  proposalEnvelopeId: string;
  policyId: string;
  requesterEmployeeHash: string;
}) {
  return `kms://mock/releases/${sha256Hex(canonicalJson(input)).slice(0, 32)}`;
}

function keyReleaseHash(input: {
  keyReleaseRequestId: string;
  proposalEnvelopeId: string;
  envelopeManifestHash: string;
  policyId: string;
  keyMaterialReference: string;
}) {
  return `0x${sha256Hex(canonicalJson(input))}`;
}

function auditStatusForRelayerStatus(status: RelayerTransactionResult["status"]): AuditStatus {
  if (status === "MOCK_CONFIRMED") {
    return "MOCK_CHAIN_CONFIRMED";
  }

  if (status === "CONFIRMED") {
    return "CHAIN_CONFIRMED";
  }

  if (status === "PENDING") {
    return "PENDING_CHAIN_CONFIRMATION";
  }

  return "CHAIN_FAILED";
}

function relayerAuditFields(relayerResult: RelayerTransactionResult) {
  return {
    txHash: relayerResult.txHash,
    blockNumber: relayerResult.blockNumber ?? null,
    chainId: relayerResult.chainId ?? null,
    contractAddress: relayerResult.contractAddress ?? null,
    relayerAddress: relayerResult.relayerAddress ?? null,
    blockchainStatus: relayerResult.status as BlockchainStatus
  };
}

function assertRelayerDidNotFail(relayerResult: RelayerTransactionResult) {
  if (relayerResult.status !== "FAILED") {
    return;
  }

  throw new AppError(502, "RELAYER_TRANSACTION_ERROR", "Blockchain relayer transaction failed.", {
    txHash: relayerResult.txHash,
    status: relayerResult.status,
    network: relayerResult.network
  });
}

async function createBlockchainTransaction(
  client: KeyManagementClient,
  input: {
    relayerResult: RelayerTransactionResult;
    action: string;
    resourceType: string;
    resourceId: string;
    tenderId: string;
  }
) {
  return createBlockchainTransactionRecord(client, {
    txHash: input.relayerResult.txHash,
    network: input.relayerResult.network,
    chainId: input.relayerResult.chainId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    tenderId: input.tenderId,
    contractAddress: input.relayerResult.contractAddress ?? null,
    relayerAddress: input.relayerResult.relayerAddress ?? null,
    status: input.relayerResult.status as BlockchainStatus,
    blockNumber: input.relayerResult.blockNumber ?? null,
    explorerUrl: input.relayerResult.explorerUrl ?? null,
    confirmedAt:
      input.relayerResult.status === "CONFIRMED" || input.relayerResult.status === "MOCK_CONFIRMED" ? new Date() : null
  });
}

async function findEnvelopeOrThrow(proposalEnvelopeId: string, client: KeyManagementClient = prisma) {
  const envelope = await client.proposalEnvelope.findUnique({
    where: { id: proposalEnvelopeId },
    include: {
      proposalPackage: {
        include: {
          tender: true
        }
      }
    }
  });

  if (!envelope) {
    throw new NotFoundError("Proposal envelope was not found.");
  }

  return envelope;
}

async function findKeyReleaseRequestOrThrow(keyReleaseRequestId: string, client: KeyManagementClient = prisma) {
  const request = await client.keyReleaseRequest.findUnique({
    where: { id: keyReleaseRequestId },
    include: {
      policy: true,
      proposalEnvelope: {
        include: {
          proposalPackage: {
            include: {
              tender: true
            }
          }
        }
      }
    }
  });

  if (!request) {
    throw new NotFoundError("Key release request was not found.");
  }

  return request;
}

async function findMatchingPolicy(
  input: {
    tenderId: string;
    proposalEnvelopeId: string;
    envelopeType: ProposalEnvelopeType;
    allowedRole: Role;
    currentState: TenderState;
  },
  client: KeyManagementClient = prisma
) {
  return client.keyReleasePolicy.findFirst({
    where: {
      tenderId: input.tenderId,
      envelopeType: input.envelopeType,
      allowedRole: input.allowedRole,
      requiredTenderState: input.currentState,
      isActive: true,
      OR: [{ proposalEnvelopeId: input.proposalEnvelopeId }, { proposalEnvelopeId: null }]
    },
    orderBy: [{ proposalEnvelopeId: "desc" }, { createdAt: "desc" }]
  });
}

async function createDeniedRequest(
  input: {
    envelope: Awaited<ReturnType<typeof findEnvelopeOrThrow>>;
    user: AuthenticatedUser;
    requesterStakeholderId?: string | null;
    context: RequestContext;
    reason: string;
  },
  client: KeyManagementClient = prisma
) {
  const tender = input.envelope.proposalPackage.tender;
  const request = await client.keyReleaseRequest.create({
    data: {
      tenderId: tender.id,
      proposalEnvelopeId: input.envelope.id,
      requesterStakeholderId: input.requesterStakeholderId ?? null,
      requesterEmployeeHash: input.user.employeeHash,
      requesterRole: input.user.role,
      requestedTenderState: tender.currentState,
      status: "DENIED",
      rejectionReason: input.reason
    }
  });

  await appendAuditEvent(
    {
      ...actorAuditFields(input.user),
      ...requestAuditFields(input.context),
      action: "KEY_RELEASE_BLOCKED",
      status: "BLOCKED",
      resourceType: "KEY_RELEASE_REQUEST",
      resourceId: request.id,
      tenderId: tender.id,
      fromState: tender.currentState,
      permissionChecked: permissions.REQUEST_KEY_RELEASE,
      permissionResult: "ALLOWED",
      transitionAllowed: false,
      rejectionReason: input.reason,
      documentHash: input.envelope.envelopeManifestHash,
      metadata: {
        proposalEnvelopeId: input.envelope.id,
        envelopeType: input.envelope.envelopeType,
        requestedTenderState: tender.currentState
      }
    },
    client
  );

  return request;
}

export async function requestEnvelopeKeyRelease(
  input: RequestEnvelopeKeyReleaseInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertId("proposalEnvelopeId", input.proposalEnvelopeId);

  const envelope = await findEnvelopeOrThrow(input.proposalEnvelopeId);
  const tender = envelope.proposalPackage.tender;
  const gateway = await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.REQUEST_KEY_RELEASE,
    user,
    context,
    metadata: {
      envelopeManifestHash: envelope.envelopeManifestHash
    }
  });
  const policy = await findMatchingPolicy({
    tenderId: tender.id,
    proposalEnvelopeId: envelope.id,
    envelopeType: envelope.envelopeType,
    allowedRole: user.role,
    currentState: tender.currentState
  });

  if (!policy) {
    const deniedRequest = await createDeniedRequest({
      envelope,
      user,
      requesterStakeholderId: gateway.decision.assignment?.stakeholderId ?? null,
      context,
      reason: policyRejectedReason
    });

    throw new InvalidTransitionError("Key release policy rejected this envelope at the current tender stage.", {
      keyReleaseRequestId: deniedRequest.id,
      proposalEnvelopeId: envelope.id,
      envelopeType: envelope.envelopeType,
      currentState: tender.currentState,
      reason: policyRejectedReason
    });
  }

  const existingRequest = await prisma.keyReleaseRequest.findFirst({
    where: {
      tenderId: tender.id,
      proposalEnvelopeId: envelope.id,
      requesterEmployeeHash: user.employeeHash,
      status: { in: ["REQUESTED", "APPROVED"] }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existingRequest) {
    return {
      request: existingRequest,
      policy,
      keyMaterialReference: existingRequest.keyMaterialReference
    };
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.keyReleaseRequest.create({
      data: {
        tenderId: tender.id,
        proposalEnvelopeId: envelope.id,
        policyId: policy.id,
        requesterStakeholderId: gateway.decision.assignment?.stakeholderId ?? null,
        requesterEmployeeHash: user.employeeHash,
        requesterRole: user.role,
        requestedTenderState: tender.currentState,
        status: "REQUESTED"
      }
    });

    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "KEY_RELEASE_REQUESTED",
        status: "SUCCESS",
        resourceType: "KEY_RELEASE_REQUEST",
        resourceId: request.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        permissionChecked: permissions.REQUEST_KEY_RELEASE,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: envelope.envelopeManifestHash,
        metadata: {
          proposalEnvelopeId: envelope.id,
          envelopeType: envelope.envelopeType,
          policyId: policy.id
        }
      },
      tx
    );

    return {
      request,
      policy,
      keyMaterialReference: null
    };
  });
}

export async function releaseEnvelopeKey(input: ReleaseEnvelopeKeyInput, user: AuthenticatedUser, context: RequestContext = {}) {
  assertId("keyReleaseRequestId", input.keyReleaseRequestId);

  const request = await findKeyReleaseRequestOrThrow(input.keyReleaseRequestId);
  const envelope = request.proposalEnvelope;
  const tender = envelope.proposalPackage.tender;

  if (request.status === "DENIED") {
    throw new AuthorizationError("Denied key release requests cannot be released.", {
      keyReleaseRequestId: request.id,
      rejectionReason: request.rejectionReason
    });
  }

  await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.RELEASE_ENVELOPE_KEY,
    user,
    context,
    metadata: {
      envelopeManifestHash: envelope.envelopeManifestHash
    }
  });

  const policy =
    request.policy ??
    (await findMatchingPolicy({
      tenderId: tender.id,
      proposalEnvelopeId: envelope.id,
      envelopeType: envelope.envelopeType,
      allowedRole: request.requesterRole,
      currentState: tender.currentState
    }));

  if (!policy || policy.requiredTenderState !== tender.currentState || policy.allowedRole !== request.requesterRole) {
    const denied = await prisma.keyReleaseRequest.update({
      where: { id: request.id },
      data: {
        status: "DENIED",
        rejectionReason: policyRejectedReason
      }
    });

    await appendAuditEvent({
      ...actorAuditFields(user),
      ...requestAuditFields(context),
      action: "KEY_RELEASE_BLOCKED",
      status: "BLOCKED",
      resourceType: "KEY_RELEASE_REQUEST",
      resourceId: request.id,
      tenderId: tender.id,
      fromState: tender.currentState,
      permissionChecked: permissions.RELEASE_ENVELOPE_KEY,
      permissionResult: "ALLOWED",
      transitionAllowed: false,
      rejectionReason: policyRejectedReason,
      documentHash: envelope.envelopeManifestHash,
      metadata: {
        proposalEnvelopeId: envelope.id,
        envelopeType: envelope.envelopeType,
        requesterRole: request.requesterRole,
        deniedStatus: denied.status
      }
    });

    throw new InvalidTransitionError("Key release policy is no longer valid for this tender stage.", {
      keyReleaseRequestId: request.id,
      reason: policyRejectedReason
    });
  }

  const keyMaterialReference =
    request.keyMaterialReference ??
    mockKeyMaterialReference({
      keyReleaseRequestId: request.id,
      proposalEnvelopeId: envelope.id,
      policyId: policy.id,
      requesterEmployeeHash: request.requesterEmployeeHash
    });
  const releaseHash = keyReleaseHash({
    keyReleaseRequestId: request.id,
    proposalEnvelopeId: envelope.id,
    envelopeManifestHash: envelope.envelopeManifestHash,
    policyId: policy.id,
    keyMaterialReference
  });
  const relayerResult = await recordKeyReleaseLogged({
    tenderId: tender.id,
    actorEmployeeHash: user.employeeHash,
    actorRole: user.role,
    fromState: tender.currentState,
    toState: tender.currentState,
    envelopeType: envelope.envelopeType,
    keyReleaseHash: releaseHash,
    metadata: {
      keyReleaseRequestId: request.id,
      proposalEnvelopeId: envelope.id,
      policyId: policy.id
    }
  });

  assertRelayerDidNotFail(relayerResult);

  return prisma.$transaction(async (tx) => {
    const released = await tx.keyReleaseRequest.update({
      where: { id: request.id },
      data: {
        policyId: policy.id,
        status: "APPROVED",
        rejectionReason: null,
        keyMaterialReference,
        releasedAt: request.releasedAt ?? new Date()
      }
    });

    await createBlockchainTransaction(tx, {
      relayerResult,
      action: "KEY_RELEASE_LOGGED",
      resourceType: "KEY_RELEASE_REQUEST",
      resourceId: released.id,
      tenderId: tender.id
    });
    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "ENVELOPE_KEY_RELEASED",
        status: auditStatusForRelayerStatus(relayerResult.status),
        resourceType: "KEY_RELEASE_REQUEST",
        resourceId: released.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        permissionChecked: permissions.RELEASE_ENVELOPE_KEY,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: envelope.envelopeManifestHash,
        ...relayerAuditFields(relayerResult),
        metadata: {
          proposalEnvelopeId: envelope.id,
          envelopeType: envelope.envelopeType,
          requesterEmployeeHash: request.requesterEmployeeHash,
          requesterRole: request.requesterRole,
          policyId: policy.id,
          keyReleaseHash: releaseHash
        }
      },
      tx
    );

    return {
      request: released,
      envelopeType: envelope.envelopeType,
      keyMaterialReference
    };
  });
}

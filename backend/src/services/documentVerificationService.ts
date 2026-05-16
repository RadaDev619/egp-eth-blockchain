import type { BlockchainStatus, Prisma } from "@prisma/client";
import {
  actorAuditFields,
  logDocumentVerificationFailed,
  logDocumentVerificationPassed,
  logInvalidTransitionAttempt,
  logTamperingDetected,
  logUnauthorizedAttempt
} from "./auditService.js";
import { createBlockchainTransactionRecord } from "./blockchainTransactionService.js";
import { canTransition, ProcurementAction, type TransitionResult } from "./procurementStateMachine.js";
import { recordTamperingDetected, type RelayerTransactionResult } from "./relayer.js";
import { prisma } from "../utils/prisma.js";
import { AppError, AuthorizationError, InvalidTransitionError, NotFoundError, ValidationError } from "../utils/errors.js";
import type { AuthenticatedUser } from "../types/domain.js";
import type { HashedPdfDocument } from "../utils/hashDocument.js";

type DocumentVerificationWriteClient = typeof prisma | Prisma.TransactionClient;

type RequestContext = {
  route?: string;
  httpMethod?: string;
  requestId?: string;
};

export type VerifyDocumentInput = {
  tenderId: string;
  versionNumber?: number;
  tenderVersionId?: string;
  uploadedDocument: HashedPdfDocument;
};

type SafeRelayerError = {
  code: string;
  message: string;
  statusCode?: number;
};

function requestAuditFields(context: RequestContext) {
  return {
    route: context.route,
    httpMethod: context.httpMethod,
    requestId: context.requestId
  };
}

function throwTransitionResult(result: TransitionResult): never {
  if (result.statusCode === 403) {
    throw new AuthorizationError("Your verified role cannot verify this procurement document.", result);
  }

  if (result.statusCode === 422) {
    throw new ValidationError("Document verification payload is invalid.", result);
  }

  throw new InvalidTransitionError("Procurement workflow rejected document verification.", result);
}

async function recordRejectedVerification(input: {
  user: AuthenticatedUser;
  tenderId: string;
  result: TransitionResult;
  context: RequestContext;
}) {
  const metadata = {
    action: ProcurementAction.VERIFY_DOCUMENT,
    reason: input.result.reason,
    requiredRole: input.result.requiredRole,
    requiredPermission: input.result.requiredPermission
  };

  await prisma.procurementTransition.create({
    data: {
      tenderId: input.tenderId,
      action: ProcurementAction.VERIFY_DOCUMENT,
      actorEmployeeHash: input.user.employeeHash,
      actorRole: input.user.role,
      fromState: input.result.fromState,
      toState: null,
      allowed: false,
      rejectionReason: input.result.reason,
      metadata
    }
  });

  const auditInput = {
    ...actorAuditFields(input.user),
    ...requestAuditFields(input.context),
    resourceType: "DOCUMENT",
    resourceId: input.tenderId,
    tenderId: input.tenderId,
    fromState: input.result.fromState,
    toState: input.result.toState,
    permissionChecked: input.result.requiredPermission,
    permissionResult: "DENIED",
    rejectionReason: input.result.reason,
    metadata
  };

  if (input.result.statusCode === 403) {
    await logUnauthorizedAttempt(auditInput);
    return;
  }

  await logInvalidTransitionAttempt(auditInput);
}

function blockchainTransactionData(input: {
  relayerResult: RelayerTransactionResult;
  action: string;
  resourceType: string;
  resourceId: string;
  tenderId: string;
}) {
  return {
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
    confirmedAt: input.relayerResult.status === "CONFIRMED" || input.relayerResult.status === "MOCK_CONFIRMED" ? new Date() : null
  };
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

function safeRelayerError(error: unknown): SafeRelayerError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode
    };
  }

  if (error instanceof Error) {
    return {
      code: error.name,
      message: error.message
    };
  }

  return {
    code: "RELAYER_ERROR",
    message: "Blockchain relayer was unavailable."
  };
}

function selectTenderVersion(
  tender: NonNullable<Awaited<ReturnType<typeof prisma.tender.findUnique>>> & {
    versions?: Array<{
      id: string;
      versionNumber: number;
      documentHash: string;
      ipfsCid: string | null;
    }>;
  },
  input: VerifyDocumentInput
) {
  const versions = tender.versions ?? [];
  const version =
    input.tenderVersionId
      ? versions.find((candidate) => candidate.id === input.tenderVersionId)
      : versions.find((candidate) => candidate.versionNumber === (input.versionNumber ?? tender.currentVersion));

  if (!version) {
    throw new NotFoundError("Tender document version was not found.");
  }

  return version;
}

async function createVerificationTransition(
  tx: DocumentVerificationWriteClient,
  input: {
    user: AuthenticatedUser;
    tenderId: string;
    result: TransitionResult;
    documentHash: string;
    expectedDocumentHash: string;
    versionId: string;
    versionNumber: number;
    matched: boolean;
  }
) {
  return tx.procurementTransition.create({
    data: {
      tenderId: input.tenderId,
      action: ProcurementAction.VERIFY_DOCUMENT,
      actorEmployeeHash: input.user.employeeHash,
      actorRole: input.user.role,
      fromState: input.result.fromState,
      toState: input.result.toState,
      allowed: true,
      metadata: {
        versionId: input.versionId,
        versionNumber: input.versionNumber,
        matched: input.matched,
        expectedDocumentHash: input.expectedDocumentHash,
        uploadedDocumentHash: input.documentHash
      }
    }
  });
}

export async function verifyDocument(input: VerifyDocumentInput, user: AuthenticatedUser, context: RequestContext = {}) {
  const tender = await prisma.tender.findUnique({
    where: { id: input.tenderId },
    include: {
      versions: { orderBy: { versionNumber: "asc" } }
    }
  });

  if (!tender) {
    throw new NotFoundError("Tender was not found.");
  }

  const version = selectTenderVersion(tender, input);
  const transition = canTransition({
    tenderId: tender.id,
    action: ProcurementAction.VERIFY_DOCUMENT,
    actorRole: user.role,
    actorEmployeeHash: user.employeeHash,
    currentState: tender.currentState
  });

  if (!transition.allowed) {
    await recordRejectedVerification({
      user,
      tenderId: tender.id,
      result: transition,
      context
    });
    throwTransitionResult(transition);
  }

  const uploadedDocumentHash = input.uploadedDocument.documentHash;
  const expectedDocumentHash = version.documentHash;
  const matched = uploadedDocumentHash === expectedDocumentHash;
  const baseAuditInput = {
    ...actorAuditFields(user),
    ...requestAuditFields(context),
    resourceType: "DOCUMENT",
    resourceId: version.id,
    tenderId: tender.id,
    fromState: transition.fromState,
    toState: transition.toState,
    permissionChecked: transition.requiredPermission,
    permissionResult: "ALLOWED",
    transitionAllowed: true,
    documentHash: uploadedDocumentHash,
    ipfsCid: version.ipfsCid,
    metadata: {
      versionId: version.id,
      versionNumber: version.versionNumber,
      expectedDocumentHash,
      uploadedDocumentHash,
      uploadedFilename: input.uploadedDocument.sanitizedFilename,
      uploadedByteLength: input.uploadedDocument.byteLength
    }
  } satisfies Omit<Parameters<typeof logDocumentVerificationPassed>[0], "action" | "status">;

  if (matched) {
    await prisma.$transaction(async (tx) => {
      await createVerificationTransition(tx, {
        user,
        tenderId: tender.id,
        result: transition,
        documentHash: uploadedDocumentHash,
        expectedDocumentHash,
        versionId: version.id,
        versionNumber: version.versionNumber,
        matched
      });
      await logDocumentVerificationPassed(baseAuditInput, tx);
    });

    return {
      verified: true,
      tamperingDetected: false,
      tenderId: tender.id,
      tenderVersionId: version.id,
      versionNumber: version.versionNumber,
      expectedDocumentHash,
      uploadedDocumentHash,
      ipfsCid: version.ipfsCid,
      txHash: null,
      blockchainStatus: null
    };
  }

  let relayerResult: RelayerTransactionResult | null = null;
  let relayerError: SafeRelayerError | null = null;

  try {
    relayerResult = await recordTamperingDetected({
      tenderId: tender.id,
      actorEmployeeHash: user.employeeHash,
      actorRole: user.role,
      fromState: transition.fromState,
      toState: transition.toState,
      expectedDocumentHash,
      observedDocumentHash: uploadedDocumentHash,
      metadata: {
        versionId: version.id,
        versionNumber: version.versionNumber
      }
    });
  } catch (error) {
    relayerError = safeRelayerError(error);
  }

  await prisma.$transaction(async (tx) => {
    await createVerificationTransition(tx, {
      user,
      tenderId: tender.id,
      result: transition,
      documentHash: uploadedDocumentHash,
      expectedDocumentHash,
      versionId: version.id,
      versionNumber: version.versionNumber,
      matched
    });
    await logDocumentVerificationFailed(baseAuditInput, tx);

    if (relayerResult) {
      await createBlockchainTransactionRecord(tx, {
        ...blockchainTransactionData({
          relayerResult,
          action: "TAMPERING_DETECTED",
          resourceType: "DOCUMENT",
          resourceId: version.id,
          tenderId: tender.id
        })
      });
      await logTamperingDetected(
        {
          ...baseAuditInput,
          ...relayerAuditFields(relayerResult)
        },
        tx
      );
      return;
    }

    await logTamperingDetected(
      {
        ...baseAuditInput,
        blockchainStatus: "FAILED",
        metadata: {
          ...(baseAuditInput.metadata as Record<string, unknown>),
          relayerError
        }
      },
      tx
    );
  });

  return {
    verified: false,
    tamperingDetected: true,
    tenderId: tender.id,
    tenderVersionId: version.id,
    versionNumber: version.versionNumber,
    expectedDocumentHash,
    uploadedDocumentHash,
    ipfsCid: version.ipfsCid,
    txHash: relayerResult?.txHash ?? null,
    blockchainStatus: relayerResult?.status ?? (relayerError ? "FAILED" : null)
  };
}

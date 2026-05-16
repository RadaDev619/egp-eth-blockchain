import type { Prisma } from "@prisma/client";
import {
  appendAuditEvent,
  actorAuditFields,
  logBidSubmitted,
  logEvaluationApproved,
  logInvalidTransitionAttempt,
  logPaymentApproved,
  logTenderCreated,
  logTenderVersionCreated,
  logUnauthorizedAttempt
} from "./auditService.js";
import { createBlockchainTransactionRecord } from "./blockchainTransactionService.js";
import { storeDocumentEvidence } from "./ipfsService.js";
import { canTransition, ProcurementAction, type TransitionResult } from "./procurementStateMachine.js";
import {
  recordBidSubmitted,
  recordEvaluationApproved,
  recordPaymentApproved,
  recordTenderClosed,
  recordTenderCreated,
  recordTenderVersionCreated,
  type RelayerTransactionResult
} from "./relayer.js";
import { prisma } from "../utils/prisma.js";
import { AppError, AuthorizationError, InvalidTransitionError, NotFoundError, ValidationError } from "../utils/errors.js";
import type { AuthenticatedUser } from "../types/domain.js";
import type { HashedPdfDocument } from "../utils/hashDocument.js";
import { sha256Hex } from "../utils/hash.js";

type ProcurementWriteClient = typeof prisma | Prisma.TransactionClient;

type RequestContext = {
  route?: string;
  httpMethod?: string;
  requestId?: string;
};

type TenderInput = {
  tenderCode: string;
  agency: string;
  title: string;
  description: string;
  documentHash: string;
  ipfsCid?: string | null;
  uploadedDocument?: HashedPdfDocument | null;
};

type TenderAmendInput = {
  tenderId: string;
  title: string;
  description: string;
  documentHash: string;
  ipfsCid?: string | null;
  changeReason: string;
  uploadedDocument?: HashedPdfDocument | null;
};

type BidSubmitInput = {
  tenderId: string;
  bidHash: string;
  bidDocumentHash?: string | null;
  ipfsCid?: string | null;
};

type ApprovalInput = {
  tenderId: string;
  comments?: string | null;
};

type CloseTenderInput = {
  tenderId: string;
  comments?: string | null;
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
    throw new AuthorizationError("Your verified role cannot perform this procurement action.", result);
  }

  if (result.statusCode === 422) {
    throw new ValidationError("Procurement transition payload is invalid.", result);
  }

  throw new InvalidTransitionError("Procurement workflow rejected this action.", result);
}

async function recordRejectedTransition(input: {
  user: AuthenticatedUser;
  action: string;
  tenderId?: string | null;
  result: TransitionResult;
  context: RequestContext;
}) {
  const metadata = {
    action: input.action,
    reason: input.result.reason,
    requiredRole: input.result.requiredRole,
    requiredPermission: input.result.requiredPermission
  };

  await prisma.procurementTransition.create({
    data: {
      tenderId: input.tenderId ?? null,
      action: input.action as never,
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
    resourceType: "PROCUREMENT_TRANSITION",
    resourceId: input.tenderId ?? null,
    tenderId: input.tenderId ?? null,
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

async function ensureAllowedTransition(input: {
  user: AuthenticatedUser;
  action: string;
  currentState: string | null;
  tenderId?: string | null;
  context: RequestContext;
  metadata?: Record<string, unknown>;
}): Promise<TransitionResult> {
  const result = canTransition({
    tenderId: input.tenderId ?? undefined,
    action: input.action,
    actorRole: input.user.role,
    actorEmployeeHash: input.user.employeeHash,
    currentState: input.currentState,
    metadata: input.metadata
  });

  if (!result.allowed) {
    await recordRejectedTransition({
      user: input.user,
      action: input.action,
      tenderId: input.tenderId,
      result,
      context: input.context
    });
    throwTransitionResult(result);
  }

  return result;
}

function blockchainTransactionData(input: {
  relayerResult: RelayerTransactionResult;
  action: string;
  resourceType: string;
  resourceId: string;
  tenderId?: string | null;
}) {
  return {
    txHash: input.relayerResult.txHash,
    network: input.relayerResult.network,
    chainId: input.relayerResult.chainId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    tenderId: input.tenderId ?? null,
    contractAddress: input.relayerResult.contractAddress ?? null,
    relayerAddress: input.relayerResult.relayerAddress ?? null,
    status: input.relayerResult.status,
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
    blockchainStatus: relayerResult.status
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

async function resolveDocumentEvidence(input: {
  documentHash: string;
  ipfsCid?: string | null;
  uploadedDocument?: HashedPdfDocument | null;
}) {
  if (!input.uploadedDocument) {
    return {
      documentHash: input.documentHash,
      ipfsCid: input.ipfsCid ?? null,
      storageMode: null,
      filename: null,
      byteLength: null
    };
  }

  const stored = await storeDocumentEvidence({
    buffer: input.uploadedDocument.buffer,
    documentHash: input.uploadedDocument.documentHash,
    sanitizedFilename: input.uploadedDocument.sanitizedFilename,
    mimeType: input.uploadedDocument.mimeType,
    byteLength: input.uploadedDocument.byteLength
  });

  return {
    documentHash: input.uploadedDocument.documentHash,
    ipfsCid: stored.ipfsCid,
    storageMode: stored.mode,
    filename: input.uploadedDocument.sanitizedFilename,
    byteLength: input.uploadedDocument.byteLength
  };
}

async function createAllowedTransition(
  tx: ProcurementWriteClient,
  input: {
    user: AuthenticatedUser;
    action: keyof typeof ProcurementAction;
    tenderId: string;
    result: TransitionResult;
    txHash: string;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return tx.procurementTransition.create({
    data: {
      tenderId: input.tenderId,
      action: ProcurementAction[input.action],
      actorEmployeeHash: input.user.employeeHash,
      actorRole: input.user.role,
      fromState: input.result.fromState,
      toState: input.result.toState,
      allowed: true,
      txHash: input.txHash,
      metadata: input.metadata
    }
  });
}

async function findTenderOrThrow(tenderId: string) {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId }
  });

  if (!tender) {
    throw new NotFoundError("Tender was not found.");
  }

  return tender;
}

export async function createTender(input: TenderInput, user: AuthenticatedUser, context: RequestContext = {}) {
  const transition = await ensureAllowedTransition({
    user,
    action: ProcurementAction.CREATE_TENDER,
    currentState: null,
    context,
    metadata: {
      tenderCode: input.tenderCode
    }
  });
  const documentEvidence = await resolveDocumentEvidence(input);

  return prisma.$transaction(async (tx) => {
    const tender = await tx.tender.create({
      data: {
        tenderCode: input.tenderCode,
        agency: input.agency,
        currentState: transition.toState ?? "CREATED",
        currentVersion: 1,
        createdByEmployeeHash: user.employeeHash,
        createdByRole: user.role,
        createdTxHash: null
      }
    });
    const relayerResult = await recordTenderCreated({
      tenderId: tender.id,
      actorEmployeeHash: user.employeeHash,
      actorRole: user.role,
      fromState: transition.fromState,
      toState: transition.toState,
      documentHash: documentEvidence.documentHash,
      ipfsCid: documentEvidence.ipfsCid,
      metadata: {
        tenderCode: input.tenderCode,
        versionNumber: 1,
        documentStorageMode: documentEvidence.storageMode
      }
    });
    assertRelayerDidNotFail(relayerResult);
    const txHash = relayerResult.txHash;

    const version = await tx.tenderVersion.create({
      data: {
        tenderId: tender.id,
        versionNumber: 1,
        title: input.title,
        description: input.description,
        documentHash: documentEvidence.documentHash,
        ipfsCid: documentEvidence.ipfsCid,
        changeReason: "Initial tender version",
        createdByEmployeeHash: user.employeeHash,
        createdByRole: user.role,
        txHash
      }
    });

    const updatedTender = await tx.tender.update({
      where: { id: tender.id },
      data: { createdTxHash: txHash },
      include: { versions: true }
    });

    await createAllowedTransition(tx, {
      user,
      action: "CREATE_TENDER",
      tenderId: tender.id,
      result: transition,
      txHash,
      metadata: {
        tenderCode: input.tenderCode,
        versionNumber: 1
      }
    });
    await createBlockchainTransactionRecord(tx, {
      ...blockchainTransactionData({
        relayerResult,
        action: "TENDER_CREATED",
        resourceType: "TENDER",
        resourceId: tender.id,
        tenderId: tender.id
      })
    });
    await logTenderCreated(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        resourceType: "TENDER",
        resourceId: tender.id,
        tenderId: tender.id,
        fromState: transition.fromState,
        toState: transition.toState,
        permissionChecked: transition.requiredPermission,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: documentEvidence.documentHash,
        ipfsCid: documentEvidence.ipfsCid,
        ...relayerAuditFields(relayerResult),
        metadata: {
          tenderCode: input.tenderCode,
          versionId: version.id,
          versionNumber: 1,
          documentStorageMode: documentEvidence.storageMode,
          documentFilename: documentEvidence.filename,
          documentByteLength: documentEvidence.byteLength
        }
      },
      tx
    );

    return updatedTender;
  });
}

export async function amendTender(input: TenderAmendInput, user: AuthenticatedUser, context: RequestContext = {}) {
  const tender = await findTenderOrThrow(input.tenderId);
  const transition = await ensureAllowedTransition({
    user,
    action: ProcurementAction.CREATE_TENDER_VERSION,
    currentState: tender.currentState,
    tenderId: tender.id,
    context,
    metadata: {
      changeReason: input.changeReason
    }
  });
  const documentEvidence = await resolveDocumentEvidence(input);

  return prisma.$transaction(async (tx) => {
    const nextVersion = tender.currentVersion + 1;
    const relayerResult = await recordTenderVersionCreated({
      tenderId: tender.id,
      actorEmployeeHash: user.employeeHash,
      actorRole: user.role,
      fromState: transition.fromState,
      toState: transition.toState,
      documentHash: documentEvidence.documentHash,
      ipfsCid: documentEvidence.ipfsCid,
      versionNumber: nextVersion,
      metadata: {
        changeReason: input.changeReason,
        documentStorageMode: documentEvidence.storageMode
      }
    });
    assertRelayerDidNotFail(relayerResult);
    const txHash = relayerResult.txHash;
    const version = await tx.tenderVersion.create({
      data: {
        tenderId: tender.id,
        versionNumber: nextVersion,
        title: input.title,
        description: input.description,
        documentHash: documentEvidence.documentHash,
        ipfsCid: documentEvidence.ipfsCid,
        changeReason: input.changeReason,
        createdByEmployeeHash: user.employeeHash,
        createdByRole: user.role,
        txHash
      }
    });

    const updatedTender = await tx.tender.update({
      where: { id: tender.id },
      data: {
        currentVersion: nextVersion,
        currentState: transition.toState ?? tender.currentState
      },
      include: { versions: true }
    });

    await createAllowedTransition(tx, {
      user,
      action: "CREATE_TENDER_VERSION",
      tenderId: tender.id,
      result: transition,
      txHash,
      metadata: {
        versionNumber: nextVersion,
        changeReason: input.changeReason
      }
    });
    await createBlockchainTransactionRecord(tx, {
      ...blockchainTransactionData({
        relayerResult,
        action: "TENDER_VERSION_CREATED",
        resourceType: "TENDER_VERSION",
        resourceId: version.id,
        tenderId: tender.id
      })
    });
    await logTenderVersionCreated(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        resourceType: "TENDER_VERSION",
        resourceId: version.id,
        tenderId: tender.id,
        fromState: transition.fromState,
        toState: transition.toState,
        permissionChecked: transition.requiredPermission,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: documentEvidence.documentHash,
        ipfsCid: documentEvidence.ipfsCid,
        ...relayerAuditFields(relayerResult),
        metadata: {
          versionNumber: nextVersion,
          changeReason: input.changeReason,
          documentStorageMode: documentEvidence.storageMode,
          documentFilename: documentEvidence.filename,
          documentByteLength: documentEvidence.byteLength
        }
      },
      tx
    );

    return updatedTender;
  });
}

export async function submitBid(input: BidSubmitInput, user: AuthenticatedUser, context: RequestContext = {}) {
  const tender = await findTenderOrThrow(input.tenderId);
  const transition = await ensureAllowedTransition({
    user,
    action: ProcurementAction.SUBMIT_BID,
    currentState: tender.currentState,
    tenderId: tender.id,
    context,
    metadata: {
      bidHash: input.bidHash
    }
  });

  return prisma.$transaction(async (tx) => {
    const relayerResult = await recordBidSubmitted({
      tenderId: tender.id,
      actorEmployeeHash: user.employeeHash,
      actorRole: user.role,
      fromState: transition.fromState,
      toState: transition.toState,
      bidHash: input.bidHash,
      metadata: {
        bidDocumentHash: input.bidDocumentHash ?? null,
        ipfsCid: input.ipfsCid ?? null
      }
    });
    assertRelayerDidNotFail(relayerResult);
    const txHash = relayerResult.txHash;
    const bid = await tx.bid.create({
      data: {
        tenderId: tender.id,
        vendorEmployeeHash: user.employeeHash,
        vendorRole: user.role,
        bidHash: input.bidHash,
        bidDocumentHash: input.bidDocumentHash ?? null,
        ipfsCid: input.ipfsCid ?? null,
        txHash,
        blockchainStatus: relayerResult.status
      }
    });

    const updatedTender = await tx.tender.update({
      where: { id: tender.id },
      data: { currentState: transition.toState ?? "BID_SUBMITTED" },
      include: { bids: true, versions: true }
    });

    await createAllowedTransition(tx, {
      user,
      action: "SUBMIT_BID",
      tenderId: tender.id,
      result: transition,
      txHash,
      metadata: {
        bidId: bid.id,
        bidHash: input.bidHash
      }
    });
    await createBlockchainTransactionRecord(tx, {
      ...blockchainTransactionData({
        relayerResult,
        action: "BID_SUBMITTED",
        resourceType: "BID",
        resourceId: bid.id,
        tenderId: tender.id
      })
    });
    await logBidSubmitted(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        resourceType: "BID",
        resourceId: bid.id,
        tenderId: tender.id,
        fromState: transition.fromState,
        toState: transition.toState,
        permissionChecked: transition.requiredPermission,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: input.bidDocumentHash ?? input.bidHash,
        ipfsCid: input.ipfsCid ?? null,
        ...relayerAuditFields(relayerResult),
        metadata: {
          bidId: bid.id
        }
      },
      tx
    );

    return updatedTender;
  });
}

export async function closeTender(input: CloseTenderInput, user: AuthenticatedUser, context: RequestContext = {}) {
  const tender = await findTenderOrThrow(input.tenderId);
  const transition = await ensureAllowedTransition({
    user,
    action: ProcurementAction.CLOSE_TENDER,
    currentState: tender.currentState,
    tenderId: tender.id,
    context,
    metadata: {
      comments: input.comments ?? null
    }
  });
  const closureHash = `0x${sha256Hex(`close:${tender.id}:${tender.currentState}:${user.employeeHash}`)}`;
  const relayerResult = await recordTenderClosed({
    tenderId: tender.id,
    actorEmployeeHash: user.employeeHash,
    actorRole: user.role,
    fromState: transition.fromState,
    toState: transition.toState,
    closureHash,
    metadata: {
      comments: input.comments ?? null
    }
  });
  assertRelayerDidNotFail(relayerResult);

  return prisma.$transaction(async (tx) => {
    const updatedTender = await tx.tender.update({
      where: { id: tender.id },
      data: { currentState: transition.toState ?? "TECHNICAL_EVALUATION" },
      include: { versions: true, bids: true, approvals: true }
    });

    await createAllowedTransition(tx, {
      user,
      action: "CLOSE_TENDER",
      tenderId: tender.id,
      result: transition,
      txHash: relayerResult.txHash,
      metadata: {
        closureHash,
        comments: input.comments ?? null
      }
    });
    await createBlockchainTransactionRecord(tx, {
      ...blockchainTransactionData({
        relayerResult,
        action: "TENDER_CLOSED",
        resourceType: "TENDER",
        resourceId: tender.id,
        tenderId: tender.id
      })
    });
    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "TENDER_SUBMISSION_CLOSED",
        status: relayerResult.status === "MOCK_CONFIRMED" ? "MOCK_CHAIN_CONFIRMED" : "CHAIN_CONFIRMED",
        resourceType: "TENDER",
        resourceId: tender.id,
        tenderId: tender.id,
        fromState: transition.fromState,
        toState: transition.toState,
        permissionChecked: transition.requiredPermission,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: closureHash,
        ...relayerAuditFields(relayerResult),
        metadata: {
          comments: input.comments ?? null,
          nextVisibleEnvelope: "TECHNICAL"
        }
      },
      tx
    );

    return updatedTender;
  });
}

async function approveTender(input: ApprovalInput, user: AuthenticatedUser, context: RequestContext, type: "EVALUATION" | "PAYMENT") {
  const tender = await findTenderOrThrow(input.tenderId);
  const action = type === "EVALUATION" ? ProcurementAction.APPROVE_EVALUATION : ProcurementAction.APPROVE_PAYMENT;
  const transition = await ensureAllowedTransition({
    user,
    action,
    currentState: tender.currentState,
    tenderId: tender.id,
    context
  });

  return prisma.$transaction(async (tx) => {
    const relayerResult =
      type === "EVALUATION"
        ? await recordEvaluationApproved({
            tenderId: tender.id,
            actorEmployeeHash: user.employeeHash,
            actorRole: user.role,
            fromState: transition.fromState,
            toState: transition.toState,
            metadata: {
              comments: input.comments ?? null
            }
          })
        : await recordPaymentApproved({
            tenderId: tender.id,
            actorEmployeeHash: user.employeeHash,
            actorRole: user.role,
            fromState: transition.fromState,
            toState: transition.toState,
            metadata: {
              comments: input.comments ?? null
            }
          });
    assertRelayerDidNotFail(relayerResult);
    const txHash = relayerResult.txHash;
    const approval = await tx.approval.create({
      data: {
        tenderId: tender.id,
        approvalType: type,
        decision: "APPROVED",
        actorEmployeeHash: user.employeeHash,
        actorRole: user.role,
        comments: input.comments ?? null,
        previousState: transition.fromState ?? tender.currentState,
        newState: transition.toState ?? tender.currentState,
        txHash,
        blockchainStatus: relayerResult.status
      }
    });

    const updatedTender = await tx.tender.update({
      where: { id: tender.id },
      data: { currentState: transition.toState ?? tender.currentState },
      include: { approvals: true, versions: true, bids: true }
    });

    await createAllowedTransition(tx, {
      user,
      action,
      tenderId: tender.id,
      result: transition,
      txHash,
      metadata: {
        approvalId: approval.id,
        approvalType: type
      }
    });
    await createBlockchainTransactionRecord(tx, {
      ...blockchainTransactionData({
        relayerResult,
        action: type === "EVALUATION" ? "EVALUATION_APPROVED" : "PAYMENT_APPROVED",
        resourceType: "APPROVAL",
        resourceId: approval.id,
        tenderId: tender.id
      })
    });

    const auditInput = {
      ...actorAuditFields(user),
      ...requestAuditFields(context),
      resourceType: "APPROVAL",
      resourceId: approval.id,
      tenderId: tender.id,
      fromState: transition.fromState,
      toState: transition.toState,
      permissionChecked: transition.requiredPermission,
      permissionResult: "ALLOWED",
      transitionAllowed: true,
      ...relayerAuditFields(relayerResult),
      metadata: {
        approvalId: approval.id,
        approvalType: type,
        comments: input.comments ?? null
      }
    };

    if (type === "EVALUATION") {
      await logEvaluationApproved(auditInput, tx);
    } else {
      await logPaymentApproved(auditInput, tx);
    }

    return updatedTender;
  });
}

export async function approveEvaluation(input: ApprovalInput, user: AuthenticatedUser, context: RequestContext = {}) {
  return approveTender(input, user, context, "EVALUATION");
}

export async function approvePayment(input: ApprovalInput, user: AuthenticatedUser, context: RequestContext = {}) {
  return approveTender(input, user, context, "PAYMENT");
}

export async function listTenders() {
  return prisma.tender.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1
      },
      bids: true,
      approvals: true
    },
    take: 100
  });
}

export async function getTender(tenderId: string) {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    include: {
      versions: { orderBy: { versionNumber: "asc" } },
      bids: { orderBy: { createdAt: "asc" } },
      approvals: { orderBy: { createdAt: "asc" } },
      transitions: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!tender) {
    throw new NotFoundError("Tender was not found.");
  }

  return tender;
}

export async function ingestEgpEvent(input: {
  eventType: "TENDER_CREATED" | "TENDER_AMENDED";
  payload: TenderInput | TenderAmendInput;
}, user: AuthenticatedUser, context: RequestContext = {}) {
  if (input.eventType === "TENDER_CREATED") {
    return createTender(input.payload as TenderInput, user, context);
  }

  return amendTender(input.payload as TenderAmendInput, user, context);
}

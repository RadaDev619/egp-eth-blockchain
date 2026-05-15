import type { AuditStatus, BlockchainStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { canonicalJson, sha256Hex } from "../utils/hash.js";
import { NotFoundError } from "../utils/errors.js";

type AuditWriteClient = typeof prisma | Prisma.TransactionClient;

export type AuditEventInput = {
  action: string;
  status: AuditStatus;
  actorEmployeeHash?: string | null;
  actorRole?: Role | null;
  actorHolderDID?: string | null;
  actorEmployer?: string | null;
  actorPosition?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  tenderId?: string | null;
  fromState?: string | null;
  toState?: string | null;
  permissionChecked?: string | null;
  permissionResult?: string | null;
  transitionAllowed?: boolean | null;
  rejectionReason?: string | null;
  documentHash?: string | null;
  ipfsCid?: string | null;
  metadata?: Prisma.InputJsonValue;
  txHash?: string | null;
  blockNumber?: number | null;
  chainId?: number | null;
  contractAddress?: string | null;
  relayerAddress?: string | null;
  blockchainStatus?: BlockchainStatus | null;
  route?: string | null;
  httpMethod?: string | null;
  requestId?: string | null;
};

export type AuditTimelineFilters = {
  tenderId?: string;
  action?: string;
  status?: AuditStatus;
  actorRole?: Role;
  actorEmployeeHash?: string;
  txHash?: string;
  fromDate?: Date;
  toDate?: Date;
};

export function actorAuditFields(user?: Express.Request["user"]) {
  if (!user) {
    return {};
  }

  return {
    actorEmployeeHash: user.employeeHash,
    actorRole: user.role,
    actorHolderDID: user.holderDID,
    actorEmployer: user.employer,
    actorPosition: user.position
  };
}

export async function appendAuditEvent(input: AuditEventInput, tx: AuditWriteClient = prisma) {
  const metadataHash = input.metadata ? `0x${sha256Hex(canonicalJson(input.metadata))}` : undefined;

  return tx.auditLog.create({
    data: {
      ...input,
      metadataHash
    }
  });
}

function auditStatusForBlockchainStatus(status?: BlockchainStatus | null): AuditStatus {
  if (status === "CONFIRMED") {
    return "CHAIN_CONFIRMED";
  }

  if (status === "PENDING") {
    return "PENDING_CHAIN_CONFIRMATION";
  }

  if (status === "FAILED") {
    return "CHAIN_FAILED";
  }

  if (status === "MOCK_CONFIRMED") {
    return "MOCK_CHAIN_CONFIRMED";
  }

  return "SUCCESS";
}

export async function logNdiProofValidated(
  input: Omit<AuditEventInput, "action" | "status">,
  tx: AuditWriteClient = prisma
) {
  return appendAuditEvent({
    ...input,
    action: "NDI_PROOF_VALIDATED",
    status: "SUCCESS"
  }, tx);
}

export async function logRoleMapped(input: Omit<AuditEventInput, "action" | "status">, tx: AuditWriteClient = prisma) {
  return appendAuditEvent({
    ...input,
    action: "ROLE_MAPPED",
    status: "SUCCESS"
  }, tx);
}

export async function logTenderCreated(
  input: Omit<AuditEventInput, "action" | "status">,
  tx: AuditWriteClient = prisma
) {
  return appendAuditEvent({
    ...input,
    action: "TENDER_CREATED",
    status: auditStatusForBlockchainStatus(input.blockchainStatus)
  }, tx);
}

export async function logTenderVersionCreated(
  input: Omit<AuditEventInput, "action" | "status">,
  tx: AuditWriteClient = prisma
) {
  return appendAuditEvent({
    ...input,
    action: "TENDER_VERSION_CREATED",
    status: auditStatusForBlockchainStatus(input.blockchainStatus)
  }, tx);
}

export async function logBidSubmitted(input: Omit<AuditEventInput, "action" | "status">, tx: AuditWriteClient = prisma) {
  return appendAuditEvent({
    ...input,
    action: "BID_SUBMITTED",
    status: auditStatusForBlockchainStatus(input.blockchainStatus)
  }, tx);
}

export async function logEvaluationApproved(
  input: Omit<AuditEventInput, "action" | "status">,
  tx: AuditWriteClient = prisma
) {
  return appendAuditEvent({
    ...input,
    action: "EVALUATION_APPROVED",
    status: auditStatusForBlockchainStatus(input.blockchainStatus)
  }, tx);
}

export async function logPaymentApproved(
  input: Omit<AuditEventInput, "action" | "status">,
  tx: AuditWriteClient = prisma
) {
  return appendAuditEvent({
    ...input,
    action: "PAYMENT_APPROVED",
    status: auditStatusForBlockchainStatus(input.blockchainStatus)
  }, tx);
}

export async function logDocumentVerificationPassed(
  input: Omit<AuditEventInput, "action" | "status">,
  tx: AuditWriteClient = prisma
) {
  return appendAuditEvent({
    ...input,
    action: "DOCUMENT_VERIFICATION_PASSED",
    status: "SUCCESS"
  }, tx);
}

export async function logDocumentVerificationFailed(
  input: Omit<AuditEventInput, "action" | "status">,
  tx: AuditWriteClient = prisma
) {
  return appendAuditEvent({
    ...input,
    action: "DOCUMENT_VERIFICATION_FAILED",
    status: "FAILED"
  }, tx);
}

export async function logTamperingDetected(
  input: Omit<AuditEventInput, "action" | "status">,
  tx: AuditWriteClient = prisma
) {
  return appendAuditEvent({
    ...input,
    action: "TAMPERING_DETECTED",
    status: input.blockchainStatus ? auditStatusForBlockchainStatus(input.blockchainStatus) : "FAILED"
  }, tx);
}

export async function logBlockchainTxConfirmed(
  input: Omit<AuditEventInput, "action" | "status">,
  tx: AuditWriteClient = prisma
) {
  return appendAuditEvent({
    ...input,
    action: "BLOCKCHAIN_TX_CONFIRMED",
    status: auditStatusForBlockchainStatus(input.blockchainStatus)
  }, tx);
}

export async function logUnauthorizedAttempt(
  input: Omit<AuditEventInput, "action" | "status">,
  tx: AuditWriteClient = prisma
) {
  return appendAuditEvent({
    ...input,
    action: "UNAUTHORIZED_ACTION_ATTEMPTED",
    status: "BLOCKED",
    permissionResult: "DENIED",
    transitionAllowed: false
  }, tx);
}

export async function logInvalidTransitionAttempt(
  input: Omit<AuditEventInput, "action" | "status">,
  tx: AuditWriteClient = prisma
) {
  return appendAuditEvent({
    ...input,
    action: "INVALID_TRANSITION_ATTEMPTED",
    status: "BLOCKED",
    transitionAllowed: false
  }, tx);
}

function timelineWhere(filters: AuditTimelineFilters): Prisma.AuditLogWhereInput {
  return {
    tenderId: filters.tenderId,
    action: filters.action,
    status: filters.status,
    actorRole: filters.actorRole,
    actorEmployeeHash: filters.actorEmployeeHash,
    txHash: filters.txHash,
    createdAt:
      filters.fromDate || filters.toDate
        ? {
            gte: filters.fromDate,
            lte: filters.toDate
          }
        : undefined
  };
}

function toTimelineEvent(event: Awaited<ReturnType<typeof prisma.auditLog.findMany>>[number]) {
  return {
    id: event.id,
    action: event.action,
    status: event.status,
    actorRole: event.actorRole,
    employeeHash: event.actorEmployeeHash,
    actorEmployeeHash: event.actorEmployeeHash,
    actorEmployer: event.actorEmployer,
    actorPosition: event.actorPosition,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    tenderId: event.tenderId,
    fromState: event.fromState,
    toState: event.toState,
    permissionChecked: event.permissionChecked,
    permissionResult: event.permissionResult,
    transitionAllowed: event.transitionAllowed,
    rejectionReason: event.rejectionReason,
    documentHash: event.documentHash,
    ipfsCid: event.ipfsCid,
    metadataHash: event.metadataHash,
    txHash: event.txHash,
    blockchainStatus: event.blockchainStatus,
    blockNumber: event.blockNumber,
    chainId: event.chainId,
    contractAddress: event.contractAddress,
    relayerAddress: event.relayerAddress,
    route: event.route,
    httpMethod: event.httpMethod,
    requestId: event.requestId,
    timestamp: event.createdAt,
    createdAt: event.createdAt
  };
}

export async function getAuditTimeline(filters: AuditTimelineFilters) {
  const events = await prisma.auditLog.findMany({
    where: timelineWhere(filters),
    orderBy: { createdAt: "asc" },
    take: 500
  });

  return events.map(toTimelineEvent);
}

export async function getTenderAuditTimeline(tenderId: string) {
  const [tender, events, blockchainTransactions] = await Promise.all([
    prisma.tender.findUnique({
      where: { id: tenderId },
      include: {
        versions: { orderBy: { versionNumber: "asc" } },
        bids: { orderBy: { createdAt: "asc" } },
        approvals: { orderBy: { createdAt: "asc" } },
        transitions: { orderBy: { createdAt: "asc" } }
      }
    }),
    prisma.auditLog.findMany({
      where: { tenderId },
      orderBy: { createdAt: "asc" },
      take: 500
    }),
    prisma.blockchainTransaction.findMany({
      where: { tenderId },
      orderBy: { createdAt: "asc" },
      take: 200
    })
  ]);

  if (!tender) {
    throw new NotFoundError("Tender audit timeline was not found.");
  }

  return {
    tender,
    versions: tender.versions,
    bids: tender.bids,
    approvals: tender.approvals,
    transitions: tender.transitions,
    blockchainTransactions,
    timeline: events.map(toTimelineEvent)
  };
}

export async function getAuditTransactionProof(txHash: string) {
  const [events, blockchainTransaction] = await Promise.all([
    prisma.auditLog.findMany({
      where: { txHash },
      orderBy: { createdAt: "asc" },
      take: 50
    }),
    prisma.blockchainTransaction.findUnique({
      where: { txHash }
    })
  ]);

  if (events.length === 0 && !blockchainTransaction) {
    throw new NotFoundError("Audit transaction proof was not found.");
  }

  return {
    txHash,
    blockchainTransaction,
    explorerUrl: blockchainTransaction?.explorerUrl ?? null,
    timeline: events.map(toTimelineEvent)
  };
}

export const auditTimelinePresenter = {
  toTimelineEvent
};

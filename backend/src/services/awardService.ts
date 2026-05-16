import type { AuditStatus, BlockchainStatus, Prisma, TenderState } from "@prisma/client";
import { appendAuditEvent, actorAuditFields } from "./auditService.js";
import { createBlockchainTransactionRecord } from "./blockchainTransactionService.js";
import {
  recordAwardApproved,
  recordAwardRecommended,
  recordContractHashCommitted,
  type RelayerTransactionResult
} from "./relayer.js";
import { assertSecureGatewayAction, SecureGatewayAction } from "./secureProcurementGateway.js";
import { permissions, type AuthenticatedUser } from "../types/domain.js";
import { AppError, InvalidTransitionError, NotFoundError, ValidationError } from "../utils/errors.js";
import { canonicalJson, sha256Hex } from "../utils/hash.js";
import { prisma } from "../utils/prisma.js";

type AwardClient = typeof prisma | Prisma.TransactionClient;

type RequestContext = {
  route?: string;
  httpMethod?: string;
  requestId?: string;
};

export type SubmitAwardRecommendationInput = {
  tenderId: string;
  evaluationReportId?: string | null;
  recommendedVendorStakeholderId?: string | null;
  recommendationHash: string;
};

export type ApproveAwardInput = {
  tenderId: string;
  awardRecommendationId: string;
  signatureHash: string;
  comments?: string | null;
};

export type CommitContractProofsInput = {
  tenderId: string;
  letterOfIntentHash?: string | null;
  letterOfAcceptanceHash?: string | null;
  contractHash?: string | null;
};

const hashPattern = /^0x[a-fA-F0-9]{64}$/;
const defaultAwardApprovalThreshold = 2;

function requestAuditFields(context: RequestContext) {
  return {
    route: context.route,
    httpMethod: context.httpMethod,
    requestId: context.requestId
  };
}

function assertHash(name: string, value: string | null | undefined) {
  if (!value || !hashPattern.test(value)) {
    throw new ValidationError(`${name} must be a 0x-prefixed SHA-256 hash.`, {
      field: name,
      expectedFormat: "0x-prefixed SHA-256 hex"
    });
  }
}

function assertAtLeastOneContractProof(input: CommitContractProofsInput) {
  if (!input.letterOfIntentHash && !input.letterOfAcceptanceHash && !input.contractHash) {
    throw new ValidationError("At least one LOI, LOA, or contract hash is required.", {
      fields: ["letterOfIntentHash", "letterOfAcceptanceHash", "contractHash"]
    });
  }
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

function approvalHash(input: { awardRecommendationId: string; approverEmployeeHash: string; signatureHash: string }) {
  return `0x${sha256Hex(canonicalJson(input))}`;
}

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as Record<string, unknown>;
}

function thresholdFromPolicy(policy: Prisma.JsonValue | null | undefined) {
  const policyObject = jsonObject(policy);
  const configured = policyObject.awardApprovalThreshold ?? policyObject.awardThreshold;

  if (configured === undefined || configured === null) {
    return defaultAwardApprovalThreshold;
  }

  if (!Number.isInteger(configured) || Number(configured) < defaultAwardApprovalThreshold || Number(configured) > 5) {
    throw new ValidationError("awardApprovalThreshold must be an integer between 2 and 5.", {
      field: "awardApprovalThreshold"
    });
  }

  return Number(configured);
}

async function findTenderOrThrow(tenderId: string, client: AwardClient = prisma) {
  const tender = await client.tender.findUnique({
    where: { id: tenderId }
  });

  if (!tender) {
    throw new NotFoundError("Tender was not found.");
  }

  return tender;
}

async function findLatestManifest(tenderId: string, client: AwardClient = prisma) {
  return client.tenderManifest.findFirst({
    where: {
      tenderId,
      status: "ACTIVE"
    },
    orderBy: { versionNumber: "desc" }
  });
}

async function awardApprovalThreshold(tenderId: string, client: AwardClient = prisma) {
  const manifest = await findLatestManifest(tenderId, client);

  return thresholdFromPolicy(manifest?.approvalPolicy);
}

async function findEvaluationReportOrThrow(reportId: string, tenderId: string, client: AwardClient = prisma) {
  const report = await client.evaluationReport.findFirst({
    where: {
      id: reportId,
      tenderId
    }
  });

  if (!report) {
    throw new NotFoundError("Evaluation report was not found.");
  }

  return report;
}

async function findFinalizedEvaluationReportOrThrow(tenderId: string, reportId: string | null | undefined, client: AwardClient = prisma) {
  const report = reportId
    ? await findEvaluationReportOrThrow(reportId, tenderId, client)
    : await client.evaluationReport.findFirst({
        where: {
          tenderId,
          status: "FINALIZED"
        },
        orderBy: { updatedAt: "desc" }
      });

  if (!report) {
    throw new InvalidTransitionError("Award recommendation requires a finalized evaluation report.", {
      tenderId,
      requiredReportStatus: "FINALIZED"
    });
  }

  if (report.status !== "FINALIZED") {
    throw new InvalidTransitionError("Award recommendation requires a finalized evaluation report.", {
      evaluationReportId: report.id,
      reportStatus: report.status
    });
  }

  return report;
}

async function findAwardRecommendationOrThrow(awardRecommendationId: string, tenderId: string, client: AwardClient = prisma) {
  const recommendation = await client.awardRecommendation.findFirst({
    where: {
      id: awardRecommendationId,
      tenderId
    },
    include: {
      approvals: true
    }
  });

  if (!recommendation) {
    throw new NotFoundError("Award recommendation was not found.");
  }

  return recommendation;
}

async function findStakeholderOrThrow(stakeholderId: string, client: AwardClient = prisma) {
  const stakeholder = await client.stakeholder.findUnique({
    where: { id: stakeholderId }
  });

  if (!stakeholder) {
    throw new NotFoundError("Recommended vendor stakeholder was not found.");
  }

  return stakeholder;
}

async function createBlockchainTransaction(
  client: AwardClient,
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

async function upsertPublicProof(
  client: AwardClient,
  input: {
    tenderId: string;
    proofType: "AWARD_RECOMMENDATION" | "AWARD_APPROVAL" | "CONTRACT_HASH";
    proofHash: string;
    sourceTxHash: string;
    blockchainStatus: BlockchainStatus;
    publicLabel: string;
    metadata: Prisma.InputJsonValue;
  }
) {
  return client.publicAuditProof.upsert({
    where: {
      tenderId_proofType_proofHash: {
        tenderId: input.tenderId,
        proofType: input.proofType,
        proofHash: input.proofHash
      }
    },
    update: {
      sourceTxHash: input.sourceTxHash,
      blockchainStatus: input.blockchainStatus,
      publicLabel: input.publicLabel,
      metadata: input.metadata
    },
    create: {
      tenderId: input.tenderId,
      proofType: input.proofType,
      proofHash: input.proofHash,
      sourceTxHash: input.sourceTxHash,
      blockchainStatus: input.blockchainStatus,
      publicLabel: input.publicLabel,
      metadata: input.metadata
    }
  });
}

export async function getAwardWorkspace(tenderId: string, user: AuthenticatedUser, context: RequestContext = {}) {
  const tender = await findTenderOrThrow(tenderId);
  const viewAction =
    user.role === "APPROVING_OFFICER"
      ? SecureGatewayAction.APPROVE_AWARD
      : user.role === "PROCUREMENT_OFFICER"
        ? SecureGatewayAction.COMMIT_CONTRACT_HASH
        : SecureGatewayAction.SUBMIT_AWARD_RECOMMENDATION;
  const metadata =
    viewAction === SecureGatewayAction.APPROVE_AWARD
      ? {
          recommendationHash: `0x${"0".repeat(64)}`,
          signatureHash: `0x${"0".repeat(64)}`
        }
      : viewAction === SecureGatewayAction.COMMIT_CONTRACT_HASH
        ? {
            contractHash: `0x${"0".repeat(64)}`
          }
        : {
            recommendationHash: `0x${"0".repeat(64)}`
          };

  await assertSecureGatewayAction({
    tenderId: tender.id,
    action: viewAction,
    user,
    context,
    metadata
  });

  const [threshold, recommendations, contractProofs] = await Promise.all([
    awardApprovalThreshold(tender.id),
    prisma.awardRecommendation.findMany({
      where: { tenderId: tender.id },
      orderBy: { createdAt: "desc" },
      include: {
        evaluationReport: true,
        recommendedVendorStakeholder: true,
        approvals: {
          orderBy: { createdAt: "asc" },
          include: { approverStakeholder: true }
        }
      }
    }),
    prisma.publicAuditProof.findMany({
      where: {
        tenderId: tender.id,
        proofType: "CONTRACT_HASH"
      },
      orderBy: { createdAt: "asc" }
    })
  ]);

  return {
    tender,
    awardApprovalThreshold: threshold,
    recommendations,
    contractProofs
  };
}

export async function submitAwardRecommendation(
  input: SubmitAwardRecommendationInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertHash("recommendationHash", input.recommendationHash);
  const tender = await findTenderOrThrow(input.tenderId);
  const report = await findFinalizedEvaluationReportOrThrow(tender.id, input.evaluationReportId);

  if (input.recommendedVendorStakeholderId) {
    const stakeholder = await findStakeholderOrThrow(input.recommendedVendorStakeholderId);

    if (stakeholder.stakeholderType !== "VENDOR") {
      throw new ValidationError("Recommended stakeholder must be a vendor.", {
        stakeholderId: stakeholder.id,
        stakeholderType: stakeholder.stakeholderType
      });
    }
  }

  const policy = await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.SUBMIT_AWARD_RECOMMENDATION,
    user,
    context,
    metadata: {
      recommendationHash: input.recommendationHash
    }
  });
  const relayerResult = await recordAwardRecommended({
    tenderId: tender.id,
    actorEmployeeHash: user.employeeHash,
      actorRole: user.role,
      fromState: tender.currentState,
      toState: "AWARD_RECOMMENDED",
      recommendationHash: input.recommendationHash,
      metadata: {
        evaluationReportId: report.id,
        recommendedVendorStakeholderId: input.recommendedVendorStakeholderId ?? null
      }
  });

  assertRelayerDidNotFail(relayerResult);

  return prisma.$transaction(async (tx) => {
    const recommendation = await tx.awardRecommendation.upsert({
      where: {
        tenderId_recommendationHash: {
          tenderId: tender.id,
          recommendationHash: input.recommendationHash
        }
      },
      update: {
        evaluationReportId: report.id,
        recommendedVendorStakeholderId: input.recommendedVendorStakeholderId ?? null,
        submittedByEmployeeHash: user.employeeHash,
        submittedByRole: user.role,
        status: "APPROVAL_PENDING",
        txHash: relayerResult.txHash,
        blockchainStatus: relayerResult.status as BlockchainStatus
      },
      create: {
        tenderId: tender.id,
        evaluationReportId: report.id,
        recommendedVendorStakeholderId: input.recommendedVendorStakeholderId ?? null,
        recommendationHash: input.recommendationHash,
        submittedByEmployeeHash: user.employeeHash,
        submittedByRole: user.role,
        status: "APPROVAL_PENDING",
        txHash: relayerResult.txHash,
        blockchainStatus: relayerResult.status as BlockchainStatus
      }
    });
    const nextState: TenderState = "AWARD_RECOMMENDED";

    if (tender.currentState !== nextState) {
      await tx.tender.update({
        where: { id: tender.id },
        data: { currentState: nextState }
      });
    }

    await createBlockchainTransaction(tx, {
      relayerResult,
      action: "AWARD_RECOMMENDED",
      resourceType: "AWARD_RECOMMENDATION",
      resourceId: recommendation.id,
      tenderId: tender.id
    });
    await upsertPublicProof(tx, {
      tenderId: tender.id,
      proofType: "AWARD_RECOMMENDATION",
      proofHash: recommendation.recommendationHash,
      sourceTxHash: relayerResult.txHash,
      blockchainStatus: relayerResult.status as BlockchainStatus,
      publicLabel: "Award recommendation commitment",
      metadata: {
        recommendationStatus: recommendation.status
      }
    });
    await tx.procurementTransition.create({
      data: {
        tenderId: tender.id,
        action: "SUBMIT_AWARD_RECOMMENDATION",
        actorEmployeeHash: user.employeeHash,
        actorRole: user.role,
        fromState: tender.currentState,
        toState: nextState,
        allowed: true,
        txHash: relayerResult.txHash,
        metadata: {
          awardRecommendationId: recommendation.id,
          gatewayAssignmentId: policy.decision.assignment?.id ?? null
        }
      }
    });
    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "AWARD_RECOMMENDATION_SUBMITTED",
        status: auditStatusForRelayerStatus(relayerResult.status),
        resourceType: "AWARD_RECOMMENDATION",
        resourceId: recommendation.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        toState: nextState,
        permissionChecked: permissions.SUBMIT_AWARD_RECOMMENDATION,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: recommendation.recommendationHash,
        ...relayerAuditFields(relayerResult),
        metadata: {
          recommendationStatus: recommendation.status,
          evaluationReportId: recommendation.evaluationReportId,
          recommendedVendorStakeholderId: recommendation.recommendedVendorStakeholderId
        }
      },
      tx
    );

    return recommendation;
  });
}

export async function approveAward(input: ApproveAwardInput, user: AuthenticatedUser, context: RequestContext = {}) {
  assertHash("signatureHash", input.signatureHash);
  const tender = await findTenderOrThrow(input.tenderId);
  const recommendation = await findAwardRecommendationOrThrow(input.awardRecommendationId, tender.id);
  const hash = approvalHash({
    awardRecommendationId: recommendation.id,
    approverEmployeeHash: user.employeeHash,
    signatureHash: input.signatureHash
  });

  const policy = await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.APPROVE_AWARD,
    user,
    context,
    metadata: {
      recommendationHash: recommendation.recommendationHash,
      signatureHash: input.signatureHash
    }
  });
  const relayerResult = await recordAwardApproved({
    tenderId: tender.id,
    actorEmployeeHash: user.employeeHash,
    actorRole: user.role,
    fromState: tender.currentState,
    toState: tender.currentState,
    approvalHash: hash,
    metadata: {
      awardRecommendationId: recommendation.id,
      recommendationHash: recommendation.recommendationHash
    }
  });

  assertRelayerDidNotFail(relayerResult);

  return prisma.$transaction(async (tx) => {
    const approval = await tx.awardApproval.upsert({
      where: {
        awardRecommendationId_approverEmployeeHash: {
          awardRecommendationId: recommendation.id,
          approverEmployeeHash: user.employeeHash
        }
      },
      update: {
        tenderId: tender.id,
        approverStakeholderId: policy.decision.assignment?.stakeholderId ?? null,
        approverRole: user.role,
        decision: "APPROVED",
        signatureHash: input.signatureHash,
        comments: input.comments ?? null,
        txHash: relayerResult.txHash,
        blockchainStatus: relayerResult.status as BlockchainStatus
      },
      create: {
        tenderId: tender.id,
        awardRecommendationId: recommendation.id,
        approverStakeholderId: policy.decision.assignment?.stakeholderId ?? null,
        approverEmployeeHash: user.employeeHash,
        approverRole: user.role,
        decision: "APPROVED",
        signatureHash: input.signatureHash,
        comments: input.comments ?? null,
        txHash: relayerResult.txHash,
        blockchainStatus: relayerResult.status as BlockchainStatus
      }
    });
    const threshold = await awardApprovalThreshold(tender.id, tx);
    const approvedCount = await tx.awardApproval.count({
      where: {
        awardRecommendationId: recommendation.id,
        decision: "APPROVED"
      }
    });
    const thresholdMet = approvedCount >= threshold;
    const nextState: TenderState = thresholdMet ? "AWARD_APPROVED" : "AWARD_RECOMMENDED";

    await tx.awardRecommendation.update({
      where: { id: recommendation.id },
      data: {
        status: thresholdMet ? "APPROVED" : "APPROVAL_PENDING"
      }
    });

    if (thresholdMet && tender.currentState !== "AWARD_APPROVED") {
      await tx.tender.update({
        where: { id: tender.id },
        data: { currentState: "AWARD_APPROVED" }
      });
    }

    await createBlockchainTransaction(tx, {
      relayerResult,
      action: "AWARD_APPROVED",
      resourceType: "AWARD_APPROVAL",
      resourceId: approval.id,
      tenderId: tender.id
    });
    await upsertPublicProof(tx, {
      tenderId: tender.id,
      proofType: "AWARD_APPROVAL",
      proofHash: hash,
      sourceTxHash: relayerResult.txHash,
      blockchainStatus: relayerResult.status as BlockchainStatus,
      publicLabel: thresholdMet ? "Award threshold approval met" : "Award approval recorded",
      metadata: {
        awardRecommendationId: recommendation.id,
        approvedCount,
        threshold,
        thresholdMet
      }
    });
    await tx.procurementTransition.create({
      data: {
        tenderId: tender.id,
        action: "APPROVE_AWARD",
        actorEmployeeHash: user.employeeHash,
        actorRole: user.role,
        fromState: tender.currentState,
        toState: nextState,
        allowed: true,
        txHash: relayerResult.txHash,
        metadata: {
          awardRecommendationId: recommendation.id,
          awardApprovalId: approval.id,
          approvedCount,
          threshold,
          thresholdMet,
          gatewayAssignmentId: policy.decision.assignment?.id ?? null
        }
      }
    });
    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: thresholdMet ? "AWARD_APPROVAL_THRESHOLD_MET" : "AWARD_APPROVAL_RECORDED",
        status: auditStatusForRelayerStatus(relayerResult.status),
        resourceType: "AWARD_APPROVAL",
        resourceId: approval.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        toState: nextState,
        permissionChecked: permissions.APPROVE_AWARD,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: hash,
        ...relayerAuditFields(relayerResult),
        metadata: {
          awardRecommendationId: recommendation.id,
          approvalHash: hash,
          approvedCount,
          threshold,
          thresholdMet
        }
      },
      tx
    );

    return {
      approval,
      approvedCount,
      threshold,
      thresholdMet,
      tenderState: nextState
    };
  });
}

export async function commitContractProofs(
  input: CommitContractProofsInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertAtLeastOneContractProof(input);

  if (input.letterOfIntentHash) {
    assertHash("letterOfIntentHash", input.letterOfIntentHash);
  }

  if (input.letterOfAcceptanceHash) {
    assertHash("letterOfAcceptanceHash", input.letterOfAcceptanceHash);
  }

  if (input.contractHash) {
    assertHash("contractHash", input.contractHash);
  }

  const tender = await findTenderOrThrow(input.tenderId);
  const documents = [
    { documentType: "LETTER_OF_INTENT", documentHash: input.letterOfIntentHash, publicLabel: "Letter of Intent hash" },
    { documentType: "LETTER_OF_ACCEPTANCE", documentHash: input.letterOfAcceptanceHash, publicLabel: "Letter of Acceptance hash" },
    { documentType: "CONTRACT", documentHash: input.contractHash, publicLabel: "Contract hash commitment" }
  ].filter((document): document is { documentType: string; documentHash: string; publicLabel: string } => Boolean(document.documentHash));

  await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.COMMIT_CONTRACT_HASH,
    user,
    context,
    metadata: {
      contractHash: input.contractHash ?? documents[0].documentHash
    }
  });

  const committed = [];

  for (const document of documents) {
    const relayerResult = await recordContractHashCommitted({
      tenderId: tender.id,
      actorEmployeeHash: user.employeeHash,
      actorRole: user.role,
      fromState: tender.currentState,
      toState: document.documentType === "CONTRACT" ? "CONTRACT_SIGNED" : tender.currentState,
      contractHash: document.documentHash,
      metadata: {
        documentType: document.documentType
      }
    });

    assertRelayerDidNotFail(relayerResult);

    const result = await prisma.$transaction(async (tx) => {
      await createBlockchainTransaction(tx, {
        relayerResult,
        action: "CONTRACT_HASH_COMMITTED",
        resourceType: "CONTRACT_DOCUMENT",
        resourceId: document.documentHash,
        tenderId: tender.id
      });
      const proof = await upsertPublicProof(tx, {
        tenderId: tender.id,
        proofType: "CONTRACT_HASH",
        proofHash: document.documentHash,
        sourceTxHash: relayerResult.txHash,
        blockchainStatus: relayerResult.status as BlockchainStatus,
        publicLabel: document.publicLabel,
        metadata: {
          documentType: document.documentType
        }
      });

      if (document.documentType === "CONTRACT" && tender.currentState !== "CONTRACT_SIGNED") {
        await tx.tender.update({
          where: { id: tender.id },
          data: { currentState: "CONTRACT_SIGNED" }
        });
        await tx.procurementTransition.create({
          data: {
            tenderId: tender.id,
            action: "COMMIT_CONTRACT_HASH",
            actorEmployeeHash: user.employeeHash,
            actorRole: user.role,
            fromState: tender.currentState,
            toState: "CONTRACT_SIGNED",
            allowed: true,
            txHash: relayerResult.txHash,
            metadata: {
              documentType: document.documentType
            }
          }
        });
      }

      await appendAuditEvent(
        {
          ...actorAuditFields(user),
          ...requestAuditFields(context),
          action: "CONTRACT_DOCUMENT_HASH_COMMITTED",
          status: auditStatusForRelayerStatus(relayerResult.status),
          resourceType: "CONTRACT_DOCUMENT",
          resourceId: proof.id,
          tenderId: tender.id,
          fromState: tender.currentState,
          toState: document.documentType === "CONTRACT" ? "CONTRACT_SIGNED" : tender.currentState,
          permissionChecked: permissions.COMMIT_CONTRACT_HASH,
          permissionResult: "ALLOWED",
          transitionAllowed: true,
          documentHash: document.documentHash,
          ...relayerAuditFields(relayerResult),
          metadata: {
            documentType: document.documentType,
            publicAuditProofId: proof.id
          }
        },
        tx
      );

      return {
        documentType: document.documentType,
        documentHash: document.documentHash,
        proof,
        txHash: relayerResult.txHash,
        blockchainStatus: relayerResult.status
      };
    });

    committed.push(result);
  }

  return {
    tenderId: tender.id,
    proofs: committed
  };
}

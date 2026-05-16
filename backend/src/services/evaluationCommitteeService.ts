import type {
  AuditStatus,
  BlockchainStatus,
  ConflictDeclarationStatus,
  EvaluationReportStatus,
  Prisma
} from "@prisma/client";
import { appendAuditEvent, actorAuditFields } from "./auditService.js";
import { createBlockchainTransactionRecord } from "./blockchainTransactionService.js";
import { recordEvaluationReportCommitted, type RelayerTransactionResult } from "./relayer.js";
import { assertSecureGatewayAction, SecureGatewayAction } from "./secureProcurementGateway.js";
import { permissions, type AuthenticatedUser } from "../types/domain.js";
import { AppError, AuthorizationError, NotFoundError, ValidationError } from "../utils/errors.js";
import { prisma } from "../utils/prisma.js";

type CommitteeClient = typeof prisma | Prisma.TransactionClient;
type TechnicalEnvelopeWithRelations = Prisma.ProposalEnvelopeGetPayload<{
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

export type DeclareConflictInput = {
  tenderId: string;
  declarationStatus: Exclude<ConflictDeclarationStatus, "PENDING">;
  declarationHash: string;
};

export type SubmitEvaluationReportInput = {
  tenderId: string;
  reportHash: string;
  technicalScoreHash?: string | null;
  financialScoreHash?: string | null;
};

export type FinalizeEvaluationReportInput = {
  tenderId: string;
  reportId: string;
};

const hashPattern = /^0x[a-fA-F0-9]{64}$/;

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
  client: CommitteeClient,
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

async function findTenderOrThrow(tenderId: string, client: CommitteeClient = prisma) {
  const tender = await client.tender.findUnique({
    where: { id: tenderId }
  });

  if (!tender) {
    throw new NotFoundError("Tender was not found.");
  }

  return tender;
}

async function findReportOrThrow(reportId: string, tenderId: string, client: CommitteeClient = prisma) {
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

async function conflictDeclarationFor(user: AuthenticatedUser, tenderId: string, client: CommitteeClient = prisma) {
  return client.conflictOfInterestDeclaration.findUnique({
    where: {
      tenderId_actorEmployeeHash: {
        tenderId,
        actorEmployeeHash: user.employeeHash
      }
    }
  });
}

async function assertNoDeclaredConflict(
  user: AuthenticatedUser,
  tenderId: string,
  action: string,
  context: RequestContext,
  client: CommitteeClient = prisma
) {
  const declaration = await conflictDeclarationFor(user, tenderId, client);

  if (declaration?.declarationStatus === "DECLARED_CONFLICT" || declaration?.declarationStatus === "REVIEW_REQUIRED") {
    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "COMMITTEE_ACTION_BLOCKED",
        status: "BLOCKED",
        resourceType: "CONFLICT_OF_INTEREST_DECLARATION",
        resourceId: declaration.id,
        tenderId,
        permissionResult: "DENIED",
        transitionAllowed: false,
        rejectionReason: "CONFLICT_OF_INTEREST_DECLARED",
        metadata: {
          attemptedAction: action,
          declarationStatus: declaration.declarationStatus
        }
      },
      client
    );

    throw new AuthorizationError("Committee member has a declared conflict for this tender.", {
      tenderId,
      declarationStatus: declaration.declarationStatus
    });
  }
}

function presenterSafeEnvelope(envelope: TechnicalEnvelopeWithRelations) {
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
    fileReferences: envelope.fileReferences?.map((fileReference) => ({
      id: fileReference.id,
      storageProvider: fileReference.storageProvider,
      storageKey: fileReference.storageKey,
      encryptedFileHash: fileReference.encryptedFileHash,
      contentType: fileReference.contentType,
      byteSize: fileReference.byteSize,
      originalFilename: fileReference.originalFilename,
      encryptionAlgorithm: fileReference.encryptionAlgorithm,
      createdAt: fileReference.createdAt
    }))
  };
}

export async function getCommitteeDashboard(tenderId: string, user: AuthenticatedUser, context: RequestContext = {}) {
  const tender = await findTenderOrThrow(tenderId);

  await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.DECLARE_CONFLICT_OF_INTEREST,
    user,
    context,
    metadata: {
      declarationHash: `0x${"0".repeat(64)}`
    }
  });

  const [assignments, declarations, reports, technicalEnvelopeCount, userDeclaration] = await Promise.all([
    prisma.tenderRoleAssignment.findMany({
      where: {
        tenderId: tender.id,
        role: { in: ["TEC_MEMBER", "TEC_CHAIR", "FINANCIAL_INSTITUTION_OFFICER"] },
        status: "ACTIVE"
      },
      orderBy: [{ role: "asc" }, { assignedAt: "asc" }],
      include: { stakeholder: true }
    }),
    prisma.conflictOfInterestDeclaration.findMany({
      where: { tenderId: tender.id },
      orderBy: { createdAt: "asc" }
    }),
    prisma.evaluationReport.findMany({
      where: { tenderId: tender.id },
      orderBy: { createdAt: "desc" }
    }),
    prisma.proposalEnvelope.count({
      where: {
        envelopeType: "TECHNICAL",
        proposalPackage: {
          tenderId: tender.id
        }
      }
    }),
    conflictDeclarationFor(user, tender.id)
  ]);

  return {
    tender,
    currentUser: {
      role: user.role,
      employeeHash: user.employeeHash,
      declarationStatus: userDeclaration?.declarationStatus ?? "PENDING"
    },
    assignments,
    declarations,
    reports,
    technicalEnvelopeCount
  };
}

export async function declareConflictOfInterest(
  input: DeclareConflictInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertHash("declarationHash", input.declarationHash);
  const tender = await findTenderOrThrow(input.tenderId);
  const policy = await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.DECLARE_CONFLICT_OF_INTEREST,
    user,
    context,
    metadata: {
      declarationHash: input.declarationHash
    }
  });

  return prisma.$transaction(async (tx) => {
    const declaration = await tx.conflictOfInterestDeclaration.upsert({
      where: {
        tenderId_actorEmployeeHash: {
          tenderId: tender.id,
          actorEmployeeHash: user.employeeHash
        }
      },
      update: {
        stakeholderId: policy.decision.assignment?.stakeholderId ?? null,
        actorRole: user.role,
        declarationStatus: input.declarationStatus,
        declarationHash: input.declarationHash,
        signedAt: new Date()
      },
      create: {
        tenderId: tender.id,
        stakeholderId: policy.decision.assignment?.stakeholderId ?? null,
        actorEmployeeHash: user.employeeHash,
        actorRole: user.role,
        declarationStatus: input.declarationStatus,
        declarationHash: input.declarationHash
      }
    });

    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "CONFLICT_OF_INTEREST_DECLARED",
        status: "SUCCESS",
        resourceType: "CONFLICT_OF_INTEREST_DECLARATION",
        resourceId: declaration.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        permissionChecked: permissions.DECLARE_CONFLICT_OF_INTEREST,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: input.declarationHash,
        metadata: {
          declarationStatus: input.declarationStatus
        }
      },
      tx
    );

    return declaration;
  });
}

export async function listTechnicalEnvelopesForCommittee(
  tenderId: string,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  const tender = await findTenderOrThrow(tenderId);

  await assertNoDeclaredConflict(user, tender.id, "VIEW_TECHNICAL_ENVELOPES", context);
  await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.REQUEST_KEY_RELEASE,
    user,
    context,
    metadata: {
      envelopeManifestHash: `0x${"0".repeat(64)}`
    }
  });

  const envelopes = await prisma.proposalEnvelope.findMany({
    where: {
      envelopeType: "TECHNICAL",
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
    action: "TECHNICAL_ENVELOPES_ACCESSED",
    status: "SUCCESS",
    resourceType: "TENDER",
    resourceId: tender.id,
    tenderId: tender.id,
    fromState: tender.currentState,
    permissionChecked: permissions.REQUEST_KEY_RELEASE,
    permissionResult: "ALLOWED",
    transitionAllowed: true,
    metadata: {
      envelopeType: "TECHNICAL",
      envelopeCount: envelopes.length
    }
  });

  return envelopes.map((envelope) => ({
    ...presenterSafeEnvelope(envelope),
    vendorStakeholder: envelope.proposalPackage.vendorStakeholder,
    keyReleaseRequests: envelope.keyReleaseRequests
  }));
}

export async function submitEvaluationReport(
  input: SubmitEvaluationReportInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertHash("reportHash", input.reportHash);

  if (input.technicalScoreHash) {
    assertHash("technicalScoreHash", input.technicalScoreHash);
  }

  if (input.financialScoreHash) {
    assertHash("financialScoreHash", input.financialScoreHash);
  }

  const tender = await findTenderOrThrow(input.tenderId);

  await assertNoDeclaredConflict(user, tender.id, "SUBMIT_EVALUATION_REPORT", context);
  const policy = await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.SUBMIT_EVALUATION_REPORT,
    user,
    context,
    metadata: {
      reportHash: input.reportHash
    }
  });

  return prisma.$transaction(async (tx) => {
    const report = await tx.evaluationReport.upsert({
      where: {
        tenderId_reportHash: {
          tenderId: tender.id,
          reportHash: input.reportHash
        }
      },
      update: {
        chairStakeholderId: user.role === "TEC_CHAIR" ? policy.decision.assignment?.stakeholderId ?? null : undefined,
        technicalScoreHash: input.technicalScoreHash ?? null,
        financialScoreHash: input.financialScoreHash ?? null,
        status: "SUBMITTED" satisfies EvaluationReportStatus,
        submittedByEmployeeHash: user.employeeHash,
        submittedByRole: user.role
      },
      create: {
        tenderId: tender.id,
        chairStakeholderId: user.role === "TEC_CHAIR" ? policy.decision.assignment?.stakeholderId ?? null : null,
        reportHash: input.reportHash,
        technicalScoreHash: input.technicalScoreHash ?? null,
        financialScoreHash: input.financialScoreHash ?? null,
        status: "SUBMITTED",
        submittedByEmployeeHash: user.employeeHash,
        submittedByRole: user.role
      }
    });

    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "EVALUATION_REPORT_SUBMITTED",
        status: "SUCCESS",
        resourceType: "EVALUATION_REPORT",
        resourceId: report.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        permissionChecked: permissions.SUBMIT_EVALUATION_REPORT,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: input.reportHash,
        metadata: {
          reportStatus: report.status,
          technicalScoreHash: input.technicalScoreHash ?? null,
          financialScoreHash: input.financialScoreHash ?? null
        }
      },
      tx
    );

    return report;
  });
}

export async function finalizeEvaluationReport(
  input: FinalizeEvaluationReportInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  const tender = await findTenderOrThrow(input.tenderId);
  const report = await findReportOrThrow(input.reportId, tender.id);

  if (user.role !== "TEC_CHAIR") {
    throw new AuthorizationError("Only the TEC chair can finalize the evaluation report.");
  }

  await assertNoDeclaredConflict(user, tender.id, "FINALIZE_EVALUATION_REPORT", context);
  const policy = await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.SUBMIT_EVALUATION_REPORT,
    user,
    context,
    metadata: {
      reportHash: report.reportHash
    }
  });
  const relayerResult = await recordEvaluationReportCommitted({
    tenderId: tender.id,
    actorEmployeeHash: user.employeeHash,
    actorRole: user.role,
    fromState: tender.currentState,
    toState: tender.currentState === "TECHNICAL_EVALUATION" ? "FINANCIAL_EVALUATION" : tender.currentState,
    reportHash: report.reportHash,
    metadata: {
      evaluationReportId: report.id,
      technicalScoreHash: report.technicalScoreHash,
      financialScoreHash: report.financialScoreHash
    }
  });

  assertRelayerDidNotFail(relayerResult);

  return prisma.$transaction(async (tx) => {
    const finalized = await tx.evaluationReport.update({
      where: { id: report.id },
      data: {
        chairStakeholderId: policy.decision.assignment?.stakeholderId ?? report.chairStakeholderId,
        status: "FINALIZED",
        txHash: relayerResult.txHash,
        blockchainStatus: relayerResult.status as BlockchainStatus
      }
    });

    const nextState = tender.currentState === "TECHNICAL_EVALUATION" ? "FINANCIAL_EVALUATION" : tender.currentState;

    if (nextState !== tender.currentState) {
      await tx.tender.update({
        where: { id: tender.id },
        data: { currentState: nextState }
      });
    }

    await createBlockchainTransaction(tx, {
      relayerResult,
      action: "EVALUATION_REPORT_COMMITTED",
      resourceType: "EVALUATION_REPORT",
      resourceId: finalized.id,
      tenderId: tender.id
    });
    await tx.publicAuditProof.upsert({
      where: {
        tenderId_proofType_proofHash: {
          tenderId: tender.id,
          proofType: "EVALUATION_REPORT",
          proofHash: finalized.reportHash
        }
      },
      update: {
        sourceTxHash: relayerResult.txHash,
        blockchainStatus: relayerResult.status as BlockchainStatus,
        publicLabel: "Evaluation report commitment",
        metadata: {
          reportStatus: finalized.status
        }
      },
      create: {
        tenderId: tender.id,
        proofType: "EVALUATION_REPORT",
        proofHash: finalized.reportHash,
        sourceTxHash: relayerResult.txHash,
        blockchainStatus: relayerResult.status as BlockchainStatus,
        publicLabel: "Evaluation report commitment",
        metadata: {
          reportStatus: finalized.status
        }
      }
    });
    await tx.procurementTransition.create({
      data: {
        tenderId: tender.id,
        action: "SUBMIT_EVALUATION_REPORT",
        actorEmployeeHash: user.employeeHash,
        actorRole: user.role,
        fromState: tender.currentState,
        toState: nextState,
        allowed: true,
        txHash: relayerResult.txHash,
        metadata: {
          evaluationReportId: finalized.id
        }
      }
    });
    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "EVALUATION_REPORT_FINALIZED",
        status: auditStatusForRelayerStatus(relayerResult.status),
        resourceType: "EVALUATION_REPORT",
        resourceId: finalized.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        toState: nextState,
        permissionChecked: permissions.SUBMIT_EVALUATION_REPORT,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: finalized.reportHash,
        ...relayerAuditFields(relayerResult),
        metadata: {
          reportStatus: finalized.status,
          chairStakeholderId: finalized.chairStakeholderId
        }
      },
      tx
    );

    return finalized;
  });
}

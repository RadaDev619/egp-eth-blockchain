import type { BlockchainStatus, Prisma, Role, TenderState } from "@prisma/client";
import { appendAuditEvent, actorAuditFields } from "./auditService.js";
import { assertSecureGatewayAction, SecureGatewayAction } from "./secureProcurementGateway.js";
import { assertPermission } from "./rbacService.js";
import { permissions, type AuthenticatedUser } from "../types/domain.js";
import { AppError, InvalidTransitionError, NotFoundError, ValidationError } from "../utils/errors.js";
import { canonicalJson, sha256Hex } from "../utils/hash.js";
import { prisma } from "../utils/prisma.js";

type ManifestClient = typeof prisma | Prisma.TransactionClient;

type RequestContext = {
  route?: string;
  httpMethod?: string;
  requestId?: string;
};

export type CreateTenderManifestInput = {
  tenderCode: string;
  agency: string;
  title: string;
  description: string;
  manifestHash: string;
  documentsHash?: string | null;
  rulesHash?: string | null;
  criteriaHash?: string | null;
  approvalPolicy?: Prisma.InputJsonValue;
  publicationThreshold?: number;
};

export type RequestPublicationInput = {
  tenderId: string;
  manifestId?: string | null;
};

export type ApprovePublicationInput = {
  tenderId: string;
  manifestId?: string | null;
  signatureHash: string;
  comments?: string | null;
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

function assertPublicationThreshold(value: number | undefined) {
  if (value === undefined) {
    return 2;
  }

  if (!Number.isInteger(value) || value < 2 || value > 5) {
    throw new ValidationError("publicationThreshold must be an integer between 2 and 5.", {
      field: "publicationThreshold"
    });
  }

  return value;
}

function mockProof(action: string, payload: unknown) {
  return {
    txHash: `0xmock${sha256Hex(canonicalJson({ action, payload })).slice(0, 58)}`,
    network: "mock",
    chainId: 31337,
    action,
    contractAddress: "mock-contract",
    relayerAddress: "mock-relayer",
    status: "MOCK_CONFIRMED" as BlockchainStatus,
    blockNumber: 0,
    explorerUrl: null,
    confirmedAt: new Date()
  };
}

function proofAuditFields(proof: ReturnType<typeof mockProof>) {
  return {
    txHash: proof.txHash,
    blockNumber: proof.blockNumber,
    chainId: proof.chainId,
    contractAddress: proof.contractAddress,
    relayerAddress: proof.relayerAddress,
    blockchainStatus: proof.status
  };
}

async function findTenderOrThrow(tenderId: string, client: ManifestClient = prisma) {
  const tender = await client.tender.findUnique({
    where: { id: tenderId }
  });

  if (!tender) {
    throw new NotFoundError("Tender was not found.");
  }

  return tender;
}

async function findManifestOrThrow(tenderId: string, manifestId?: string | null, client: ManifestClient = prisma) {
  const manifest = manifestId
    ? await client.tenderManifest.findFirst({ where: { id: manifestId, tenderId } })
    : await client.tenderManifest.findFirst({
        where: { tenderId, status: { in: ["DRAFT", "ACTIVE"] } },
        orderBy: { versionNumber: "desc" }
      });

  if (!manifest) {
    throw new NotFoundError("Tender manifest was not found.");
  }

  return manifest;
}

async function upsertActorStakeholder(user: AuthenticatedUser, client: ManifestClient) {
  const stakeholderType = user.role === "VENDOR" ? "VENDOR" : "PROCURING_AGENCY";

  return client.stakeholder.upsert({
    where: {
      userId_stakeholderType: {
        userId: user.userId,
        stakeholderType
      }
    },
    update: {
      displayName: user.position,
      organization: user.employer,
      employeeHash: user.employeeHash
    },
    create: {
      userId: user.userId,
      stakeholderType,
      displayName: user.position,
      organization: user.employer,
      employeeHash: user.employeeHash,
      publicIdentifier: `${user.role}-${user.userId}`
    }
  });
}

async function createTransition(
  client: ManifestClient,
  input: {
    tenderId: string;
    action: "CREATE_TENDER_MANIFEST" | "REQUEST_PUBLICATION_APPROVAL" | "APPROVE_TENDER_PUBLICATION";
    user: AuthenticatedUser;
    fromState: TenderState | null;
    toState: TenderState | null;
    txHash: string;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return client.procurementTransition.create({
    data: {
      tenderId: input.tenderId,
      action: input.action,
      actorEmployeeHash: input.user.employeeHash,
      actorRole: input.user.role,
      fromState: input.fromState,
      toState: input.toState,
      allowed: true,
      txHash: input.txHash,
      metadata: input.metadata
    }
  });
}

async function createBlockchainTransaction(
  client: ManifestClient,
  input: {
    proof: ReturnType<typeof mockProof>;
    resourceType: string;
    resourceId: string;
    tenderId: string;
  }
) {
  return client.blockchainTransaction.create({
    data: {
      txHash: input.proof.txHash,
      network: input.proof.network,
      chainId: input.proof.chainId,
      action: input.proof.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      tenderId: input.tenderId,
      contractAddress: input.proof.contractAddress,
      relayerAddress: input.proof.relayerAddress,
      status: input.proof.status,
      blockNumber: input.proof.blockNumber,
      explorerUrl: input.proof.explorerUrl,
      confirmedAt: input.proof.confirmedAt
    }
  });
}

export async function createTenderManifest(
  input: CreateTenderManifestInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertPermission(user.role, permissions.CREATE_TENDER_MANIFEST);
  assertHash("manifestHash", input.manifestHash);
  assertHash("documentsHash", input.documentsHash ?? input.manifestHash);

  if (input.rulesHash) {
    assertHash("rulesHash", input.rulesHash);
  }

  if (input.criteriaHash) {
    assertHash("criteriaHash", input.criteriaHash);
  }

  const publicationThreshold = assertPublicationThreshold(input.publicationThreshold);

  if (user.role !== "PROCUREMENT_OFFICER") {
    throw new AppError(403, "AUTHORIZATION_ERROR", "Only a procurement officer can create a tender manifest.");
  }

  return prisma.$transaction(async (tx) => {
    const tender = await tx.tender.create({
      data: {
        tenderCode: input.tenderCode,
        agency: input.agency,
        currentState: "DRAFT",
        currentVersion: 1,
        createdByEmployeeHash: user.employeeHash,
        createdByRole: user.role,
        createdTxHash: null
      }
    });
    const stakeholder = await upsertActorStakeholder(user, tx);

    await tx.tenderRoleAssignment.upsert({
      where: {
        tenderId_stakeholderId_role: {
          tenderId: tender.id,
          stakeholderId: stakeholder.id,
          role: user.role
        }
      },
      update: {
        status: "ACTIVE",
        assignedByEmployeeHash: user.employeeHash,
        activatedAt: new Date(),
        revokedAt: null
      },
      create: {
        tenderId: tender.id,
        stakeholderId: stakeholder.id,
        role: user.role,
        status: "ACTIVE",
        assignedByEmployeeHash: user.employeeHash,
        activatedAt: new Date(),
        metadata: {
          bootstrapCreator: true
        }
      }
    });

    const proof = mockProof("TENDER_MANIFEST_COMMITTED", {
      tenderId: tender.id,
      manifestHash: input.manifestHash,
      actorEmployeeHash: user.employeeHash,
      actorRole: user.role
    });
    const manifest = await tx.tenderManifest.create({
      data: {
        tenderId: tender.id,
        versionNumber: 1,
        manifestHash: input.manifestHash,
        rulesHash: input.rulesHash ?? null,
        criteriaHash: input.criteriaHash ?? null,
        documentsHash: input.documentsHash ?? input.manifestHash,
        approvalPolicy: input.approvalPolicy ?? {
          publicationThreshold,
          requiredRoles: ["PROCUREMENT_OFFICER", "APPROVING_OFFICER"]
        },
        publicationThreshold,
        status: "DRAFT",
        createdByEmployeeHash: user.employeeHash,
        createdByRole: user.role,
        txHash: proof.txHash,
        blockchainStatus: proof.status
      }
    });

    await tx.tenderVersion.create({
      data: {
        tenderId: tender.id,
        versionNumber: 1,
        title: input.title,
        description: input.description,
        documentHash: input.documentsHash ?? input.manifestHash,
        changeReason: "Initial secure tender manifest",
        createdByEmployeeHash: user.employeeHash,
        createdByRole: user.role,
        txHash: proof.txHash
      }
    });

    await tx.tender.update({
      where: { id: tender.id },
      data: { createdTxHash: proof.txHash }
    });
    await createTransition(tx, {
      tenderId: tender.id,
      action: "CREATE_TENDER_MANIFEST",
      user,
      fromState: null,
      toState: "DRAFT",
      txHash: proof.txHash,
      metadata: {
        manifestId: manifest.id,
        manifestHash: input.manifestHash,
        publicationThreshold
      }
    });
    await createBlockchainTransaction(tx, {
      proof,
      resourceType: "TENDER_MANIFEST",
      resourceId: manifest.id,
      tenderId: tender.id
    });
    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "TENDER_MANIFEST_COMMITTED",
        status: "MOCK_CHAIN_CONFIRMED",
        resourceType: "TENDER_MANIFEST",
        resourceId: manifest.id,
        tenderId: tender.id,
        fromState: null,
        toState: "DRAFT",
        permissionChecked: permissions.CREATE_TENDER_MANIFEST,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: input.documentsHash ?? input.manifestHash,
        ...proofAuditFields(proof),
        metadata: {
          tenderCode: input.tenderCode,
          manifestHash: input.manifestHash,
          publicationThreshold
        }
      },
      tx
    );

    return getTenderManifestStatus(tender.id, tx);
  });
}

export async function requestTenderPublication(
  input: RequestPublicationInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  const tender = await findTenderOrThrow(input.tenderId);
  const manifest = await findManifestOrThrow(tender.id, input.manifestId);

  await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.REQUEST_PUBLICATION_APPROVAL,
    user,
    context,
    metadata: {
      manifestHash: manifest.manifestHash
    }
  });

  return prisma.$transaction(async (tx) => {
    const proof = mockProof("TENDER_PUBLICATION_REQUESTED", {
      tenderId: tender.id,
      manifestId: manifest.id,
      manifestHash: manifest.manifestHash,
      actorEmployeeHash: user.employeeHash,
      actorRole: user.role
    });

    const approval = await tx.tenderPublicationApproval.upsert({
      where: {
        manifestId_approverEmployeeHash: {
          manifestId: manifest.id,
          approverEmployeeHash: user.employeeHash
        }
      },
      update: {
        tenderId: tender.id,
        approverRole: user.role,
        decision: "APPROVED",
        signatureHash: manifest.manifestHash,
        comments: "Publication requested by procurement officer.",
        txHash: proof.txHash,
        blockchainStatus: proof.status
      },
      create: {
        tenderId: tender.id,
        manifestId: manifest.id,
        approverEmployeeHash: user.employeeHash,
        approverRole: user.role,
        decision: "APPROVED",
        signatureHash: manifest.manifestHash,
        comments: "Publication requested by procurement officer.",
        txHash: proof.txHash,
        blockchainStatus: proof.status
      }
    });

    await tx.tenderManifest.update({
      where: { id: manifest.id },
      data: {
        status: "ACTIVE",
        txHash: proof.txHash,
        blockchainStatus: proof.status
      }
    });
    await tx.tender.update({
      where: { id: tender.id },
      data: {
        currentState: "PUBLICATION_PENDING"
      }
    });
    await createTransition(tx, {
      tenderId: tender.id,
      action: "REQUEST_PUBLICATION_APPROVAL",
      user,
      fromState: tender.currentState,
      toState: "PUBLICATION_PENDING",
      txHash: proof.txHash,
      metadata: {
        manifestId: manifest.id,
        approvalId: approval.id,
        threshold: manifest.publicationThreshold
      }
    });
    await createBlockchainTransaction(tx, {
      proof,
      resourceType: "TENDER_MANIFEST",
      resourceId: manifest.id,
      tenderId: tender.id
    });
    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "TENDER_PUBLICATION_REQUESTED",
        status: "MOCK_CHAIN_CONFIRMED",
        resourceType: "TENDER_MANIFEST",
        resourceId: manifest.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        toState: "PUBLICATION_PENDING",
        permissionChecked: permissions.REQUEST_PUBLICATION_APPROVAL,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: manifest.documentsHash ?? manifest.manifestHash,
        ...proofAuditFields(proof),
        metadata: {
          manifestId: manifest.id,
          approvalId: approval.id,
          publicationThreshold: manifest.publicationThreshold
        }
      },
      tx
    );

    return getTenderManifestStatus(tender.id, tx);
  });
}

export async function approveTenderPublication(
  input: ApprovePublicationInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertHash("signatureHash", input.signatureHash);
  const tender = await findTenderOrThrow(input.tenderId);
  const manifest = await findManifestOrThrow(tender.id, input.manifestId);

  await assertSecureGatewayAction({
    tenderId: tender.id,
    action: SecureGatewayAction.APPROVE_TENDER_PUBLICATION,
    user,
    context,
    metadata: {
      manifestHash: manifest.manifestHash,
      signatureHash: input.signatureHash
    }
  });

  return prisma.$transaction(async (tx) => {
    const approvalProof = mockProof("TENDER_PUBLICATION_APPROVED", {
      tenderId: tender.id,
      manifestId: manifest.id,
      signatureHash: input.signatureHash,
      actorEmployeeHash: user.employeeHash,
      actorRole: user.role
    });

    const approval = await tx.tenderPublicationApproval.upsert({
      where: {
        manifestId_approverEmployeeHash: {
          manifestId: manifest.id,
          approverEmployeeHash: user.employeeHash
        }
      },
      update: {
        tenderId: tender.id,
        approverRole: user.role,
        decision: "APPROVED",
        signatureHash: input.signatureHash,
        comments: input.comments ?? null,
        txHash: approvalProof.txHash,
        blockchainStatus: approvalProof.status
      },
      create: {
        tenderId: tender.id,
        manifestId: manifest.id,
        approverEmployeeHash: user.employeeHash,
        approverRole: user.role,
        decision: "APPROVED",
        signatureHash: input.signatureHash,
        comments: input.comments ?? null,
        txHash: approvalProof.txHash,
        blockchainStatus: approvalProof.status
      }
    });
    const approvedCount = await tx.tenderPublicationApproval.count({
      where: {
        manifestId: manifest.id,
        decision: "APPROVED"
      }
    });
    const published = approvedCount >= manifest.publicationThreshold;
    const finalProof = published
      ? mockProof("TENDER_PUBLISHED", {
          tenderId: tender.id,
          manifestId: manifest.id,
          approvedCount,
          publicationThreshold: manifest.publicationThreshold
        })
      : approvalProof;

    await createBlockchainTransaction(tx, {
      proof: approvalProof,
      resourceType: "TENDER_PUBLICATION_APPROVAL",
      resourceId: approval.id,
      tenderId: tender.id
    });

    if (published) {
      await tx.tender.update({
        where: { id: tender.id },
        data: {
          currentState: "PUBLISHED"
        }
      });
      await tx.publicAuditProof.upsert({
        where: {
          tenderId_proofType_proofHash: {
            tenderId: tender.id,
            proofType: "TENDER_MANIFEST",
            proofHash: manifest.manifestHash
          }
        },
        update: {
          sourceTxHash: finalProof.txHash,
          blockchainStatus: finalProof.status,
          publicLabel: "Tender manifest published",
          metadata: {
            approvedCount,
            publicationThreshold: manifest.publicationThreshold
          }
        },
        create: {
          tenderId: tender.id,
          proofType: "TENDER_MANIFEST",
          proofHash: manifest.manifestHash,
          sourceTxHash: finalProof.txHash,
          blockchainStatus: finalProof.status,
          publicLabel: "Tender manifest published",
          metadata: {
            approvedCount,
            publicationThreshold: manifest.publicationThreshold
          }
        }
      });
      await createBlockchainTransaction(tx, {
        proof: finalProof,
        resourceType: "TENDER",
        resourceId: tender.id,
        tenderId: tender.id
      });
    }

    await createTransition(tx, {
      tenderId: tender.id,
      action: "APPROVE_TENDER_PUBLICATION",
      user,
      fromState: tender.currentState,
      toState: published ? "PUBLISHED" : tender.currentState,
      txHash: finalProof.txHash,
      metadata: {
        manifestId: manifest.id,
        approvalId: approval.id,
        approvedCount,
        publicationThreshold: manifest.publicationThreshold
      }
    });
    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: published ? "TENDER_PUBLISHED" : "TENDER_PUBLICATION_APPROVED",
        status: "MOCK_CHAIN_CONFIRMED",
        resourceType: published ? "TENDER" : "TENDER_PUBLICATION_APPROVAL",
        resourceId: published ? tender.id : approval.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        toState: published ? "PUBLISHED" : tender.currentState,
        permissionChecked: permissions.APPROVE_TENDER_PUBLICATION,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: manifest.documentsHash ?? manifest.manifestHash,
        ...proofAuditFields(finalProof),
        metadata: {
          manifestId: manifest.id,
          approvalId: approval.id,
          approvedCount,
          publicationThreshold: manifest.publicationThreshold
        }
      },
      tx
    );

    return getTenderManifestStatus(tender.id, tx);
  });
}

export async function getTenderManifestStatus(tenderId: string, client: ManifestClient = prisma) {
  const tender = await client.tender.findUnique({
    where: { id: tenderId },
    include: {
      manifests: {
        orderBy: { versionNumber: "desc" },
        include: {
          publicationApprovals: {
            orderBy: { createdAt: "asc" }
          }
        }
      },
      publicAuditProofs: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!tender) {
    throw new NotFoundError("Tender was not found.");
  }

  const manifest = tender.manifests[0] ?? null;
  const approvalCount = manifest?.publicationApprovals.filter((approval) => approval.decision === "APPROVED").length ?? 0;

  return {
    tender,
    manifest,
    approvalCount,
    publicationThreshold: manifest?.publicationThreshold ?? null,
    publicationReady: manifest ? approvalCount >= manifest.publicationThreshold : false,
    currentState: tender.currentState
  };
}

export function assertManifestCanPublish(status: Awaited<ReturnType<typeof getTenderManifestStatus>>) {
  if (!status.manifest || !status.publicationReady) {
    throw new InvalidTransitionError("Publication approval threshold has not been met.");
  }
}

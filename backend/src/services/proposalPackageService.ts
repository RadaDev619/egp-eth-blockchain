import type { BlockchainStatus, Prisma, ProposalEnvelopeType } from "@prisma/client";
import { appendAuditEvent, actorAuditFields } from "./auditService.js";
import { assertSecureGatewayAction, SecureGatewayAction } from "./secureProcurementGateway.js";
import type { AuthenticatedUser } from "../types/domain.js";
import { permissions } from "../types/domain.js";
import { AuthorizationError, NotFoundError, ValidationError } from "../utils/errors.js";
import { canonicalJson, sha256Hex } from "../utils/hash.js";
import type { HashedEncryptedProposalFile } from "../utils/encryptedProposalFile.js";
import { sanitizeFilename } from "../utils/hashDocument.js";
import { prisma } from "../utils/prisma.js";

type ProposalClient = typeof prisma | Prisma.TransactionClient;

type RequestContext = {
  route?: string;
  httpMethod?: string;
  requestId?: string;
};

export type ProposalEnvelopeInput = {
  envelopeType: ProposalEnvelopeType;
  encryptedFileHash: string;
  envelopeManifestHash: string;
  storageReference: string;
  storageProvider?: string | null;
  contentType?: string | null;
  byteSize: number;
  originalFilename?: string | null;
  ipfsCid?: string | null;
  keyId?: string | null;
  encryptionAlgorithm?: string | null;
  iv?: string | null;
  authTag?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type SubmitProposalPackageInput = {
  tenderId: string;
  packageHash: string;
  envelopes: ProposalEnvelopeInput[];
  metadata?: Prisma.InputJsonValue;
};

export type CommitProposalEnvelopeInput = ProposalEnvelopeInput & {
  proposalPackageId: string;
};

export type UploadEncryptedProposalEnvelopeInput = {
  proposalPackageId: string;
  envelopeType: ProposalEnvelopeType;
  envelopeManifestHash: string;
  encryptedFile: HashedEncryptedProposalFile;
  keyId?: string | null;
  iv?: string | null;
  authTag?: string | null;
  encryptionAlgorithm?: string | null;
  ipfsCid?: string | null;
};

const hashPattern = /^0x[a-fA-F0-9]{64}$/;
const requiredEnvelopeTypes: ProposalEnvelopeType[] = [
  "ELIGIBILITY",
  "TECHNICAL",
  "FINANCIAL",
  "SUPPORTING_DOCUMENTS",
  "TENDER_SECURITY"
];

const forbiddenProposalKeys = new Set([
  "plaintext",
  "plainText",
  "fileContent",
  "fileContents",
  "proposalContent",
  "decryptedContent",
  "rawEmploymentId",
  "employmentId",
  "salary",
  "privateKey"
]);

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

function findForbiddenPath(value: unknown, path: string[] = []): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const nested = findForbiddenPath(item, [...path, String(index)]);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (forbiddenProposalKeys.has(key)) {
      return [...path, key].join(".");
    }

    const nested = findForbiddenPath(nestedValue, [...path, key]);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function assertNoPlaintextMetadata(input: unknown) {
  const forbiddenPath = findForbiddenPath(input);

  if (forbiddenPath) {
    throw new ValidationError("Proposal package accepts encrypted references and hashes only.", {
      field: forbiddenPath
    });
  }
}

function assertEnvelopeInput(envelope: ProposalEnvelopeInput) {
  assertHash("encryptedFileHash", envelope.encryptedFileHash);
  assertHash("envelopeManifestHash", envelope.envelopeManifestHash);

  if (!requiredEnvelopeTypes.includes(envelope.envelopeType)) {
    throw new ValidationError("Proposal envelope type is not supported.", {
      envelopeType: envelope.envelopeType
    });
  }

  if (!envelope.storageReference?.trim()) {
    throw new ValidationError("storageReference is required for encrypted proposal evidence.", {
      field: "storageReference"
    });
  }

  if (!Number.isInteger(envelope.byteSize) || envelope.byteSize <= 0) {
    throw new ValidationError("byteSize must describe the encrypted file size.", {
      field: "byteSize"
    });
  }

  assertNoPlaintextMetadata(envelope);
}

function assertCompleteEnvelopeSet(envelopes: ProposalEnvelopeInput[]) {
  const seen = new Set<ProposalEnvelopeType>();

  for (const envelope of envelopes) {
    assertEnvelopeInput(envelope);

    if (seen.has(envelope.envelopeType)) {
      throw new ValidationError("Proposal package contains duplicate envelope types.", {
        envelopeType: envelope.envelopeType
      });
    }

    seen.add(envelope.envelopeType);
  }

  const missing = requiredEnvelopeTypes.filter((envelopeType) => !seen.has(envelopeType));

  if (missing.length > 0) {
    throw new ValidationError("Proposal package must include every required envelope type.", {
      missingEnvelopeTypes: missing
    });
  }
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

async function createBlockchainTransaction(
  client: ProposalClient,
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

async function createPublicProof(
  client: ProposalClient,
  input: {
    tenderId: string;
    proofType: "PROPOSAL_PACKAGE" | "ENVELOPE_COMMITMENT";
    proofHash: string;
    sourceTxHash: string;
    publicLabel: string;
    metadata?: Prisma.InputJsonValue;
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
      blockchainStatus: "MOCK_CONFIRMED",
      publicLabel: input.publicLabel,
      metadata: input.metadata
    },
    create: {
      tenderId: input.tenderId,
      proofType: input.proofType,
      proofHash: input.proofHash,
      sourceTxHash: input.sourceTxHash,
      blockchainStatus: "MOCK_CONFIRMED",
      publicLabel: input.publicLabel,
      metadata: input.metadata
    }
  });
}

async function findProposalPackageOrThrow(proposalPackageId: string) {
  const proposalPackage = await prisma.proposalPackage.findUnique({
    where: { id: proposalPackageId },
    include: {
      tender: true,
      envelopes: {
        orderBy: { envelopeType: "asc" },
        include: {
          fileReferences: true
        }
      },
      vendorStakeholder: true
    }
  });

  if (!proposalPackage) {
    throw new NotFoundError("Proposal package was not found.");
  }

  return proposalPackage;
}

function assertVendorOwnsPackage(user: AuthenticatedUser, proposalPackage: { vendorEmployeeHash: string }) {
  if (proposalPackage.vendorEmployeeHash !== user.employeeHash) {
    throw new AuthorizationError("Vendor can only modify their own proposal package.");
  }
}

async function upsertEnvelope(
  client: ProposalClient,
  input: {
    tenderId: string;
    proposalPackageId: string;
    envelope: ProposalEnvelopeInput;
    proof: ReturnType<typeof mockProof>;
  }
) {
  const envelope = await client.proposalEnvelope.upsert({
    where: {
      proposalPackageId_envelopeType: {
        proposalPackageId: input.proposalPackageId,
        envelopeType: input.envelope.envelopeType
      }
    },
    update: {
      encryptedFileHash: input.envelope.encryptedFileHash,
      envelopeManifestHash: input.envelope.envelopeManifestHash,
      encryptionAlgorithm: input.envelope.encryptionAlgorithm ?? "AES-256-GCM",
      keyId: input.envelope.keyId ?? null,
      storageReference: input.envelope.storageReference,
      ipfsCid: input.envelope.ipfsCid ?? null,
      txHash: input.proof.txHash,
      blockchainStatus: input.proof.status
    },
    create: {
      proposalPackageId: input.proposalPackageId,
      envelopeType: input.envelope.envelopeType,
      encryptedFileHash: input.envelope.encryptedFileHash,
      envelopeManifestHash: input.envelope.envelopeManifestHash,
      encryptionAlgorithm: input.envelope.encryptionAlgorithm ?? "AES-256-GCM",
      keyId: input.envelope.keyId ?? null,
      storageReference: input.envelope.storageReference,
      ipfsCid: input.envelope.ipfsCid ?? null,
      txHash: input.proof.txHash,
      blockchainStatus: input.proof.status
    }
  });

  await client.encryptedFileReference.upsert({
    where: {
      storageKey: input.envelope.storageReference
    },
    update: {
      tenderId: input.tenderId,
      proposalEnvelopeId: envelope.id,
      storageProvider: input.envelope.storageProvider ?? "mock",
      encryptedFileHash: input.envelope.encryptedFileHash,
      contentType: input.envelope.contentType ?? "application/octet-stream",
      byteSize: input.envelope.byteSize,
      originalFilename: input.envelope.originalFilename ? sanitizeFilename(input.envelope.originalFilename) : null,
      iv: input.envelope.iv ?? null,
      authTag: input.envelope.authTag ?? null,
      encryptionAlgorithm: input.envelope.encryptionAlgorithm ?? "AES-256-GCM"
    },
    create: {
      tenderId: input.tenderId,
      proposalEnvelopeId: envelope.id,
      storageProvider: input.envelope.storageProvider ?? "mock",
      storageKey: input.envelope.storageReference,
      encryptedFileHash: input.envelope.encryptedFileHash,
      contentType: input.envelope.contentType ?? "application/octet-stream",
      byteSize: input.envelope.byteSize,
      originalFilename: input.envelope.originalFilename ? sanitizeFilename(input.envelope.originalFilename) : null,
      iv: input.envelope.iv ?? null,
      authTag: input.envelope.authTag ?? null,
      encryptionAlgorithm: input.envelope.encryptionAlgorithm ?? "AES-256-GCM"
    }
  });

  return envelope;
}

export async function submitProposalPackage(
  input: SubmitProposalPackageInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertHash("packageHash", input.packageHash);
  assertNoPlaintextMetadata(input.metadata);
  assertCompleteEnvelopeSet(input.envelopes);

  const packagePolicy = await assertSecureGatewayAction({
    tenderId: input.tenderId,
    action: SecureGatewayAction.SUBMIT_PROPOSAL_PACKAGE,
    user,
    context,
    metadata: {
      packageHash: input.packageHash
    }
  });
  const envelopePolicies = await Promise.all(
    input.envelopes.map((envelope) =>
      assertSecureGatewayAction({
        tenderId: input.tenderId,
        action: SecureGatewayAction.COMMIT_PROPOSAL_ENVELOPE,
        user,
        context,
        metadata: {
          encryptedFileHash: envelope.encryptedFileHash,
          envelopeManifestHash: envelope.envelopeManifestHash,
          envelopeType: envelope.envelopeType
        }
      })
    )
  );
  const vendorStakeholderId = packagePolicy.decision.assignment?.stakeholderId ?? null;

  return prisma.$transaction(async (tx) => {
    const packageProof = mockProof("PROPOSAL_PACKAGE_SUBMITTED", {
      tenderId: input.tenderId,
      packageHash: input.packageHash,
      actorEmployeeHash: user.employeeHash,
      actorRole: user.role
    });
    const proposalPackage = await tx.proposalPackage.upsert({
      where: {
        tenderId_vendorEmployeeHash: {
          tenderId: input.tenderId,
          vendorEmployeeHash: user.employeeHash
        }
      },
      update: {
        vendorStakeholderId,
        packageHash: input.packageHash,
        status: "SUBMITTED",
        submittedAt: new Date(),
        txHash: packageProof.txHash,
        blockchainStatus: packageProof.status
      },
      create: {
        tenderId: input.tenderId,
        vendorStakeholderId,
        vendorEmployeeHash: user.employeeHash,
        packageHash: input.packageHash,
        status: "SUBMITTED",
        submittedAt: new Date(),
        txHash: packageProof.txHash,
        blockchainStatus: packageProof.status
      }
    });

    await createBlockchainTransaction(tx, {
      proof: packageProof,
      resourceType: "PROPOSAL_PACKAGE",
      resourceId: proposalPackage.id,
      tenderId: input.tenderId
    });
    await createPublicProof(tx, {
      tenderId: input.tenderId,
      proofType: "PROPOSAL_PACKAGE",
      proofHash: input.packageHash,
      sourceTxHash: packageProof.txHash,
      publicLabel: "Proposal package commitment",
      metadata: {
        envelopeCount: input.envelopes.length
      }
    });
    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "PROPOSAL_PACKAGE_SUBMITTED",
        status: "MOCK_CHAIN_CONFIRMED",
        resourceType: "PROPOSAL_PACKAGE",
        resourceId: proposalPackage.id,
        tenderId: input.tenderId,
        fromState: packagePolicy.decision.tender?.currentState ?? null,
        toState: packagePolicy.decision.tender?.currentState ?? null,
        permissionChecked: permissions.SUBMIT_PROPOSAL_PACKAGE,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: input.packageHash,
        ...proofAuditFields(packageProof),
        metadata: {
          packageHash: input.packageHash,
          envelopeCount: input.envelopes.length
        }
      },
      tx
    );

    const envelopes = [];

    for (const [index, envelopeInput] of input.envelopes.entries()) {
      const envelopeProof = mockProof("PROPOSAL_ENVELOPE_COMMITTED", {
        tenderId: input.tenderId,
        proposalPackageId: proposalPackage.id,
        envelopeType: envelopeInput.envelopeType,
        encryptedFileHash: envelopeInput.encryptedFileHash,
        envelopeManifestHash: envelopeInput.envelopeManifestHash,
        actorEmployeeHash: user.employeeHash,
        actorRole: user.role
      });
      const envelope = await upsertEnvelope(tx, {
        tenderId: input.tenderId,
        proposalPackageId: proposalPackage.id,
        envelope: envelopeInput,
        proof: envelopeProof
      });

      envelopes.push(envelope);
      await createBlockchainTransaction(tx, {
        proof: envelopeProof,
        resourceType: "PROPOSAL_ENVELOPE",
        resourceId: envelope.id,
        tenderId: input.tenderId
      });
      await createPublicProof(tx, {
        tenderId: input.tenderId,
        proofType: "ENVELOPE_COMMITMENT",
        proofHash: envelopeInput.envelopeManifestHash,
        sourceTxHash: envelopeProof.txHash,
        publicLabel: `${envelopeInput.envelopeType} envelope commitment`,
        metadata: {
          envelopeType: envelopeInput.envelopeType
        }
      });
      await appendAuditEvent(
        {
          ...actorAuditFields(user),
          ...requestAuditFields(context),
          action: "PROPOSAL_ENVELOPE_COMMITTED",
          status: "MOCK_CHAIN_CONFIRMED",
          resourceType: "PROPOSAL_ENVELOPE",
          resourceId: envelope.id,
          tenderId: input.tenderId,
          fromState: envelopePolicies[index]?.decision.tender?.currentState ?? null,
          toState: envelopePolicies[index]?.decision.tender?.currentState ?? null,
          permissionChecked: permissions.COMMIT_PROPOSAL_ENVELOPE,
          permissionResult: "ALLOWED",
          transitionAllowed: true,
          documentHash: envelopeInput.encryptedFileHash,
          ipfsCid: envelopeInput.ipfsCid ?? null,
          ...proofAuditFields(envelopeProof),
          metadata: {
            proposalPackageId: proposalPackage.id,
            envelopeType: envelopeInput.envelopeType,
            envelopeManifestHash: envelopeInput.envelopeManifestHash
          }
        },
        tx
      );
    }

    return {
      proposalPackage,
      envelopes
    };
  });
}

export async function commitProposalEnvelope(
  input: CommitProposalEnvelopeInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertEnvelopeInput(input);
  const proposalPackage = await findProposalPackageOrThrow(input.proposalPackageId);
  assertVendorOwnsPackage(user, proposalPackage);
  const policy = await assertSecureGatewayAction({
    tenderId: proposalPackage.tenderId,
    action: SecureGatewayAction.COMMIT_PROPOSAL_ENVELOPE,
    user,
    context,
    metadata: {
      encryptedFileHash: input.encryptedFileHash,
      envelopeManifestHash: input.envelopeManifestHash,
      envelopeType: input.envelopeType
    }
  });

  return prisma.$transaction(async (tx) => {
    const proof = mockProof("PROPOSAL_ENVELOPE_COMMITTED", {
      tenderId: proposalPackage.tenderId,
      proposalPackageId: proposalPackage.id,
      envelopeType: input.envelopeType,
      encryptedFileHash: input.encryptedFileHash,
      envelopeManifestHash: input.envelopeManifestHash,
      actorEmployeeHash: user.employeeHash,
      actorRole: user.role
    });
    const envelope = await upsertEnvelope(tx, {
      tenderId: proposalPackage.tenderId,
      proposalPackageId: proposalPackage.id,
      envelope: input,
      proof
    });

    await createBlockchainTransaction(tx, {
      proof,
      resourceType: "PROPOSAL_ENVELOPE",
      resourceId: envelope.id,
      tenderId: proposalPackage.tenderId
    });
    await createPublicProof(tx, {
      tenderId: proposalPackage.tenderId,
      proofType: "ENVELOPE_COMMITMENT",
      proofHash: input.envelopeManifestHash,
      sourceTxHash: proof.txHash,
      publicLabel: `${input.envelopeType} envelope commitment`,
      metadata: {
        envelopeType: input.envelopeType
      }
    });
    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "PROPOSAL_ENVELOPE_COMMITTED",
        status: "MOCK_CHAIN_CONFIRMED",
        resourceType: "PROPOSAL_ENVELOPE",
        resourceId: envelope.id,
        tenderId: proposalPackage.tenderId,
        fromState: policy.decision.tender?.currentState ?? null,
        toState: policy.decision.tender?.currentState ?? null,
        permissionChecked: permissions.COMMIT_PROPOSAL_ENVELOPE,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: input.encryptedFileHash,
        ipfsCid: input.ipfsCid ?? null,
        ...proofAuditFields(proof),
        metadata: {
          proposalPackageId: proposalPackage.id,
          envelopeType: input.envelopeType,
          envelopeManifestHash: input.envelopeManifestHash
        }
      },
      tx
    );

    return envelope;
  });
}

export async function uploadEncryptedProposalEnvelope(
  input: UploadEncryptedProposalEnvelopeInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  assertHash("envelopeManifestHash", input.envelopeManifestHash);

  return commitProposalEnvelope(
    {
      proposalPackageId: input.proposalPackageId,
      envelopeType: input.envelopeType,
      encryptedFileHash: input.encryptedFile.encryptedFileHash,
      envelopeManifestHash: input.envelopeManifestHash,
      storageReference: `mock-storage/proposals/${input.proposalPackageId}/${input.envelopeType.toLowerCase()}/${input.encryptedFile.encryptedFileHash.slice(2)}.enc`,
      storageProvider: "mock-browser-encrypted",
      contentType: input.encryptedFile.mimeType,
      byteSize: input.encryptedFile.byteLength,
      originalFilename: input.encryptedFile.sanitizedFilename,
      encryptionAlgorithm: input.encryptionAlgorithm ?? "AES-GCM",
      keyId: input.keyId ?? null,
      iv: input.iv ?? null,
      authTag: input.authTag ?? null,
      ipfsCid: input.ipfsCid ?? null
    },
    user,
    context
  );
}

export async function listProposalPackages(tenderId: string, user: AuthenticatedUser) {
  const where =
    user.role === "VENDOR"
      ? {
          tenderId,
          vendorEmployeeHash: user.employeeHash
        }
      : { tenderId };

  return prisma.proposalPackage.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      envelopes: {
        orderBy: { envelopeType: "asc" },
        include: {
          fileReferences: true
        }
      },
      vendorStakeholder: true
    }
  });
}

export async function getProposalPackage(proposalPackageId: string, user: AuthenticatedUser) {
  const proposalPackage = await findProposalPackageOrThrow(proposalPackageId);

  if (user.role === "VENDOR") {
    assertVendorOwnsPackage(user, proposalPackage);
  }

  return proposalPackage;
}

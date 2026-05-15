import type { BlockchainStatus, LegacyEgpRecordType, Prisma, ProposalEnvelopeType } from "@prisma/client";
import { appendAuditEvent, actorAuditFields } from "./auditService.js";
import { permissions, type AuthenticatedUser } from "../types/domain.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { canonicalJson, sha256Hex } from "../utils/hash.js";
import { sanitizeFilename } from "../utils/hashDocument.js";
import { prisma } from "../utils/prisma.js";

type LegacyEgpClient = typeof prisma | Prisma.TransactionClient;
type LegacyEgpRecordWithReference = Prisma.LegacyEgpRecordGetPayload<{
  include: {
    encryptedFileReference: true;
  };
}>;

type RequestContext = {
  route?: string;
  httpMethod?: string;
  requestId?: string;
};

export type LegacyEncryptedFileReferenceInput = {
  proposalEnvelopeId?: string | null;
  envelopeType?: ProposalEnvelopeType | null;
  storageProvider: string;
  storageKey: string;
  encryptedFileHash: string;
  contentType: string;
  byteSize: number;
  originalFilename?: string | null;
  encryptionAlgorithm?: string | null;
  iv?: string | null;
  authTag?: string | null;
};

export type IngestLegacyEgpRecordInput = {
  sourceSystem?: string | null;
  legacyRecordId: string;
  tenderId: string;
  recordType: LegacyEgpRecordType;
  operation: string;
  operationalStatus: string;
  trustLayerTxHash?: string | null;
  blockchainStatus?: BlockchainStatus | null;
  legacyCreatedAt?: Date | null;
  encryptedFileReferenceId?: string | null;
  encryptedFileReference?: LegacyEncryptedFileReferenceInput | null;
  metadata?: Prisma.InputJsonValue;
};

export type LegacyEgpRecordFilters = {
  tenderId?: string;
  recordType?: LegacyEgpRecordType;
  trustLayerTxHash?: string;
};

const simulatorSourceSystem = "EGP_SIMULATOR";
const hashPattern = /^0x[a-fA-F0-9]{64}$/;
const forbiddenLegacyKeys = new Set([
  "plaintext",
  "plainText",
  "fileContent",
  "fileContents",
  "proposalContent",
  "decryptedContent",
  "documentBody",
  "rawEmploymentId",
  "employmentId",
  "salary",
  "privateKey",
  "relayerPrivateKey",
  "ndiClientSecret",
  "walletSeed"
]);

function requestAuditFields(context: RequestContext) {
  return {
    route: context.route,
    httpMethod: context.httpMethod,
    requestId: context.requestId
  };
}

function assertRequiredString(name: string, value: string | null | undefined) {
  if (!value?.trim()) {
    throw new ValidationError(`${name} is required.`, { field: name });
  }
}

function assertHash(name: string, value: string | null | undefined) {
  if (!value || !hashPattern.test(value)) {
    throw new ValidationError(`${name} must be a 0x-prefixed SHA-256 hash.`, {
      field: name,
      expectedFormat: "0x-prefixed SHA-256 hex"
    });
  }
}

function assertPositiveInteger(name: string, value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${name} must be a positive integer.`, { field: name });
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
    if (forbiddenLegacyKeys.has(key)) {
      return [...path, key].join(".");
    }

    const nested = findForbiddenPath(nestedValue, [...path, key]);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function assertNoPlaintextOrSensitiveFields(value: unknown) {
  const forbiddenPath = findForbiddenPath(value);

  if (forbiddenPath) {
    throw new ValidationError("Legacy e-GP simulator accepts encrypted references and hashes only.", {
      field: forbiddenPath
    });
  }
}

function assertSimulatorSource(sourceSystem: string | null | undefined) {
  const normalized = sourceSystem?.trim() || simulatorSourceSystem;

  if (normalized !== simulatorSourceSystem) {
    throw new ValidationError("Production e-GP integration is not enabled for this MVP.", {
      sourceSystem: normalized,
      allowedSourceSystem: simulatorSourceSystem
    });
  }

  return normalized;
}

function metadataHash(metadata: Prisma.InputJsonValue | undefined) {
  return metadata ? `0x${sha256Hex(canonicalJson(metadata))}` : null;
}

async function findTenderOrThrow(tenderId: string, client: LegacyEgpClient = prisma) {
  const tender = await client.tender.findUnique({
    where: { id: tenderId }
  });

  if (!tender) {
    throw new NotFoundError("Tender was not found.");
  }

  return tender;
}

async function assertEncryptedReferenceBelongsToTender(
  tenderId: string,
  encryptedFileReferenceId: string,
  client: LegacyEgpClient = prisma
) {
  const reference = await client.encryptedFileReference.findFirst({
    where: {
      id: encryptedFileReferenceId,
      OR: [
        { tenderId },
        {
          proposalEnvelope: {
            proposalPackage: {
              tenderId
            }
          }
        }
      ]
    }
  });

  if (!reference) {
    throw new NotFoundError("Encrypted file reference was not found for this tender.");
  }

  return reference;
}

async function assertProposalEnvelopeBelongsToTender(tenderId: string, proposalEnvelopeId: string, client: LegacyEgpClient = prisma) {
  const envelope = await client.proposalEnvelope.findFirst({
    where: {
      id: proposalEnvelopeId,
      proposalPackage: {
        tenderId
      }
    }
  });

  if (!envelope) {
    throw new NotFoundError("Proposal envelope was not found for this tender.");
  }

  return envelope;
}

function validateEncryptedFileReference(reference: LegacyEncryptedFileReferenceInput) {
  assertRequiredString("storageProvider", reference.storageProvider);
  assertRequiredString("storageKey", reference.storageKey);
  assertRequiredString("contentType", reference.contentType);
  assertHash("encryptedFileHash", reference.encryptedFileHash);
  assertPositiveInteger("byteSize", reference.byteSize);
  assertNoPlaintextOrSensitiveFields(reference);
}

async function upsertEncryptedFileReference(
  tenderId: string,
  reference: LegacyEncryptedFileReferenceInput,
  client: LegacyEgpClient
) {
  validateEncryptedFileReference(reference);

  if (reference.proposalEnvelopeId) {
    await assertProposalEnvelopeBelongsToTender(tenderId, reference.proposalEnvelopeId, client);
  }

  return client.encryptedFileReference.upsert({
    where: {
      storageKey: reference.storageKey
    },
    update: {
      tenderId: reference.proposalEnvelopeId ? null : tenderId,
      proposalEnvelopeId: reference.proposalEnvelopeId ?? null,
      storageProvider: reference.storageProvider,
      encryptedFileHash: reference.encryptedFileHash,
      contentType: reference.contentType,
      byteSize: reference.byteSize,
      originalFilename: reference.originalFilename ? sanitizeFilename(reference.originalFilename) : null,
      iv: reference.iv ?? null,
      authTag: reference.authTag ?? null,
      encryptionAlgorithm: reference.encryptionAlgorithm ?? "AES-256-GCM"
    },
    create: {
      tenderId: reference.proposalEnvelopeId ? null : tenderId,
      proposalEnvelopeId: reference.proposalEnvelopeId ?? null,
      storageProvider: reference.storageProvider,
      storageKey: reference.storageKey,
      encryptedFileHash: reference.encryptedFileHash,
      contentType: reference.contentType,
      byteSize: reference.byteSize,
      originalFilename: reference.originalFilename ? sanitizeFilename(reference.originalFilename) : null,
      iv: reference.iv ?? null,
      authTag: reference.authTag ?? null,
      encryptionAlgorithm: reference.encryptionAlgorithm ?? "AES-256-GCM"
    }
  });
}

function legacyPresenter(record: LegacyEgpRecordWithReference) {
  return {
    id: record.id,
    sourceSystem: record.sourceSystem,
    legacyRecordId: record.legacyRecordId,
    recordType: record.recordType,
    operation: record.operation,
    operationalStatus: record.operationalStatus,
    tenderId: record.tenderId,
    encryptedFileReferenceId: record.encryptedFileReferenceId,
    encryptedFileReference: record.encryptedFileReference
      ? {
          id: record.encryptedFileReference.id,
          storageProvider: record.encryptedFileReference.storageProvider,
          storageKey: record.encryptedFileReference.storageKey,
          encryptedFileHash: record.encryptedFileReference.encryptedFileHash,
          contentType: record.encryptedFileReference.contentType,
          byteSize: record.encryptedFileReference.byteSize,
          originalFilename: record.encryptedFileReference.originalFilename,
          encryptionAlgorithm: record.encryptedFileReference.encryptionAlgorithm,
          createdAt: record.encryptedFileReference.createdAt
        }
      : null,
    trustLayerTxHash: record.trustLayerTxHash,
    blockchainStatus: record.blockchainStatus,
    metadataHash: record.metadataHash,
    legacyCreatedAt: record.legacyCreatedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export async function ingestLegacyEgpRecord(
  input: IngestLegacyEgpRecordInput,
  user: AuthenticatedUser,
  context: RequestContext = {}
) {
  const sourceSystem = assertSimulatorSource(input.sourceSystem);
  assertRequiredString("legacyRecordId", input.legacyRecordId);
  assertRequiredString("operation", input.operation);
  assertRequiredString("operationalStatus", input.operationalStatus);

  if (input.trustLayerTxHash) {
    assertRequiredString("trustLayerTxHash", input.trustLayerTxHash);
  }

  if (input.encryptedFileReference && input.encryptedFileReferenceId) {
    throw new ValidationError("Use either encryptedFileReference or encryptedFileReferenceId, not both.", {
      fields: ["encryptedFileReference", "encryptedFileReferenceId"]
    });
  }

  assertNoPlaintextOrSensitiveFields(input.metadata);
  const tender = await findTenderOrThrow(input.tenderId);

  return prisma.$transaction(async (tx) => {
    const encryptedFileReference = input.encryptedFileReference
      ? await upsertEncryptedFileReference(tender.id, input.encryptedFileReference, tx)
      : input.encryptedFileReferenceId
        ? await assertEncryptedReferenceBelongsToTender(tender.id, input.encryptedFileReferenceId, tx)
        : null;
    const record = await tx.legacyEgpRecord.upsert({
      where: {
        legacyRecordId: input.legacyRecordId
      },
      update: {
        sourceSystem,
        recordType: input.recordType,
        operation: input.operation,
        operationalStatus: input.operationalStatus,
        tenderId: tender.id,
        encryptedFileReferenceId: encryptedFileReference?.id ?? null,
        trustLayerTxHash: input.trustLayerTxHash ?? null,
        blockchainStatus: input.blockchainStatus ?? null,
        metadataHash: metadataHash(input.metadata),
        metadata: input.metadata ?? undefined,
        legacyCreatedAt: input.legacyCreatedAt ?? null
      },
      create: {
        sourceSystem,
        legacyRecordId: input.legacyRecordId,
        recordType: input.recordType,
        operation: input.operation,
        operationalStatus: input.operationalStatus,
        tenderId: tender.id,
        encryptedFileReferenceId: encryptedFileReference?.id ?? null,
        trustLayerTxHash: input.trustLayerTxHash ?? null,
        blockchainStatus: input.blockchainStatus ?? null,
        metadataHash: metadataHash(input.metadata),
        metadata: input.metadata ?? undefined,
        legacyCreatedAt: input.legacyCreatedAt ?? null
      },
      include: {
        encryptedFileReference: true
      }
    });

    if (input.trustLayerTxHash) {
      const existingTransaction = await tx.blockchainTransaction.findUnique({
        where: { txHash: input.trustLayerTxHash }
      });

      if (!existingTransaction) {
        await tx.blockchainTransaction.create({
          data: {
            txHash: input.trustLayerTxHash,
            network: input.trustLayerTxHash.startsWith("0xmock") ? "mock" : "external",
            chainId: input.trustLayerTxHash.startsWith("0xmock") ? 31337 : null,
            action: "LEGACY_EGP_RECORD_LINKED",
            resourceType: "LEGACY_EGP_RECORD",
            resourceId: record.id,
            tenderId: tender.id,
            status: input.blockchainStatus ?? "MOCK_CONFIRMED",
            blockNumber: input.trustLayerTxHash.startsWith("0xmock") ? 0 : null,
            confirmedAt: input.blockchainStatus === "CONFIRMED" || input.blockchainStatus === "MOCK_CONFIRMED" ? new Date() : null
          }
        });
      }
    }

    await appendAuditEvent(
      {
        ...actorAuditFields(user),
        ...requestAuditFields(context),
        action: "LEGACY_EGP_RECORD_LINKED",
        status: input.blockchainStatus === "FAILED" ? "CHAIN_FAILED" : "SUCCESS",
        resourceType: "LEGACY_EGP_RECORD",
        resourceId: record.id,
        tenderId: tender.id,
        fromState: tender.currentState,
        permissionChecked: permissions.MANAGE_LEGACY_EGP_SIMULATOR,
        permissionResult: "ALLOWED",
        transitionAllowed: true,
        documentHash: encryptedFileReference?.encryptedFileHash ?? null,
        txHash: input.trustLayerTxHash ?? null,
        blockchainStatus: input.blockchainStatus ?? null,
        metadata: {
          sourceSystem,
          legacyRecordId: input.legacyRecordId,
          recordType: input.recordType,
          operation: input.operation,
          encryptedFileReferenceId: encryptedFileReference?.id ?? null
        }
      },
      tx
    );

    return legacyPresenter(record);
  });
}

export async function listLegacyEgpRecords(filters: LegacyEgpRecordFilters = {}) {
  const records = await prisma.legacyEgpRecord.findMany({
    where: {
      tenderId: filters.tenderId,
      recordType: filters.recordType,
      trustLayerTxHash: filters.trustLayerTxHash
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      encryptedFileReference: true
    }
  });

  return records.map(legacyPresenter);
}

export async function getLegacyEgpRecord(id: string) {
  const record = await prisma.legacyEgpRecord.findFirst({
    where: {
      OR: [{ id }, { legacyRecordId: id }]
    },
    include: {
      encryptedFileReference: true
    }
  });

  if (!record) {
    throw new NotFoundError("Legacy e-GP simulator record was not found.");
  }

  return legacyPresenter(record);
}

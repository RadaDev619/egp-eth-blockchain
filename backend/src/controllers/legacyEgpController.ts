import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  getLegacyEgpRecord,
  ingestLegacyEgpRecord,
  listLegacyEgpRecords
} from "../services/legacyEgpAdapter.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ValidationError } from "../utils/errors.js";

const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

const encryptedFileReferenceSchema = z.object({
  proposalEnvelopeId: z.string().min(1).optional(),
  envelopeType: z
    .enum(["ELIGIBILITY", "TECHNICAL", "FINANCIAL", "SUPPORTING_DOCUMENTS", "TENDER_SECURITY"])
    .optional(),
  storageProvider: z.string().min(1),
  storageKey: z.string().min(1),
  encryptedFileHash: hashSchema,
  contentType: z.string().min(1),
  byteSize: z.number().int().positive(),
  originalFilename: z.string().max(255).optional(),
  encryptionAlgorithm: z.string().min(1).optional(),
  iv: z.string().min(1).optional(),
  authTag: z.string().min(1).optional()
});

const ingestLegacyRecordSchema = z.object({
  sourceSystem: z.string().optional(),
  legacyRecordId: z.string().min(1),
  tenderId: z.string().min(1),
  recordType: z.enum([
    "TENDER_OPERATION",
    "PROPOSAL_STORAGE",
    "EVALUATION_UPDATE",
    "AWARD_UPDATE",
    "CONTRACT_UPDATE",
    "DOCUMENT_REFERENCE"
  ]),
  operation: z.string().min(1),
  operationalStatus: z.string().min(1),
  trustLayerTxHash: z.string().min(1).optional(),
  blockchainStatus: z.enum(["NOT_SUBMITTED", "PENDING", "CONFIRMED", "FAILED", "MOCK_CONFIRMED"]).optional(),
  legacyCreatedAt: z.coerce.date().optional(),
  encryptedFileReferenceId: z.string().min(1).optional(),
  encryptedFileReference: encryptedFileReferenceSchema.optional(),
  metadata: z.unknown().optional()
});

const legacyQuerySchema = z.object({
  tenderId: z.string().min(1).optional(),
  recordType: z
    .enum([
      "TENDER_OPERATION",
      "PROPOSAL_STORAGE",
      "EVALUATION_UPDATE",
      "AWARD_UPDATE",
      "CONTRACT_UPDATE",
      "DOCUMENT_REFERENCE"
    ])
    .optional(),
  trustLayerTxHash: z.string().min(1).optional()
});

function requireUser(req: Request) {
  if (!req.user) {
    throw new ValidationError("Authenticated user context is required.");
  }

  return req.user;
}

function requestContext(req: Request) {
  return {
    route: req.originalUrl,
    httpMethod: req.method,
    requestId: req.requestId
  };
}

export const ingestLegacyEgpRecordController = asyncHandler(async (req: Request, res: Response) => {
  const payload = ingestLegacyRecordSchema.parse(req.body);
  const record = await ingestLegacyEgpRecord(
    {
      sourceSystem: payload.sourceSystem,
      legacyRecordId: payload.legacyRecordId,
      tenderId: payload.tenderId,
      recordType: payload.recordType,
      operation: payload.operation,
      operationalStatus: payload.operationalStatus,
      trustLayerTxHash: payload.trustLayerTxHash,
      blockchainStatus: payload.blockchainStatus,
      legacyCreatedAt: payload.legacyCreatedAt,
      encryptedFileReferenceId: payload.encryptedFileReferenceId,
      encryptedFileReference: payload.encryptedFileReference,
      metadata: payload.metadata as Prisma.InputJsonValue | undefined
    },
    requireUser(req),
    requestContext(req)
  );

  res.status(201).json({ record });
});

export const listLegacyEgpRecordsController = asyncHandler(async (req: Request, res: Response) => {
  const filters = legacyQuerySchema.parse(req.query);
  const records = await listLegacyEgpRecords(filters);

  res.json({ records });
});

export const getLegacyEgpRecordController = asyncHandler(async (req: Request, res: Response) => {
  const id = z.string().min(1).parse(req.params.id);
  const record = await getLegacyEgpRecord(id);

  res.json({ record });
});

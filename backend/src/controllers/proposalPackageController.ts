import type { Prisma, ProposalEnvelopeType } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  commitProposalEnvelope,
  getProposalPackage,
  listProposalPackages,
  submitProposalPackage
} from "../services/proposalPackageService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ValidationError } from "../utils/errors.js";

const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const envelopeTypeSchema = z.enum(["ELIGIBILITY", "TECHNICAL", "FINANCIAL", "SUPPORTING_DOCUMENTS", "TENDER_SECURITY"]);

const envelopeSchema = z.object({
  envelopeType: envelopeTypeSchema,
  encryptedFileHash: hashSchema,
  envelopeManifestHash: hashSchema,
  storageReference: z.string().min(1),
  storageProvider: z.string().min(1).optional(),
  contentType: z.string().min(1).optional(),
  byteSize: z.coerce.number().int().positive(),
  originalFilename: z.string().min(1).optional(),
  ipfsCid: z.string().min(1).optional(),
  keyId: z.string().min(1).optional(),
  encryptionAlgorithm: z.string().min(1).optional(),
  iv: z.string().min(1).optional(),
  authTag: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional()
});

const submitProposalSchema = z.object({
  packageHash: hashSchema,
  envelopes: z.array(envelopeSchema).min(5),
  metadata: z.record(z.unknown()).optional()
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

export const submitProposalPackageController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const payload = submitProposalSchema.parse(req.body);
  const result = await submitProposalPackage(
    {
      tenderId,
      packageHash: payload.packageHash,
      envelopes: payload.envelopes.map((envelope) => ({
        ...envelope,
        envelopeType: envelope.envelopeType as ProposalEnvelopeType,
        metadata: envelope.metadata as Prisma.InputJsonValue | undefined
      })),
      metadata: payload.metadata as Prisma.InputJsonValue | undefined
    },
    requireUser(req),
    requestContext(req)
  );

  res.status(201).json(result);
});

export const listProposalPackagesController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const proposalPackages = await listProposalPackages(tenderId, requireUser(req));

  res.json({ proposalPackages });
});

export const getProposalPackageController = asyncHandler(async (req: Request, res: Response) => {
  const proposalPackageId = z.string().min(1).parse(req.params.proposalPackageId);
  const proposalPackage = await getProposalPackage(proposalPackageId, requireUser(req));

  res.json({ proposalPackage });
});

export const commitProposalEnvelopeController = asyncHandler(async (req: Request, res: Response) => {
  const proposalPackageId = z.string().min(1).parse(req.params.proposalPackageId);
  const payload = envelopeSchema.parse(req.body);
  const envelope = await commitProposalEnvelope(
    {
      ...payload,
      proposalPackageId,
      envelopeType: payload.envelopeType as ProposalEnvelopeType,
      metadata: payload.metadata as Prisma.InputJsonValue | undefined
    },
    requireUser(req),
    requestContext(req)
  );

  res.json({ envelope });
});

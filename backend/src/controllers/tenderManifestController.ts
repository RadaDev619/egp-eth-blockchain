import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  approveTenderPublication,
  createTenderManifest,
  getTenderManifestStatus,
  requestTenderPublication
} from "../services/tenderManifestPublicationService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ValidationError } from "../utils/errors.js";

const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

const createManifestSchema = z.object({
  tenderCode: z.string().min(3),
  agency: z.string().min(2),
  title: z.string().min(3),
  description: z.string().min(3),
  manifestHash: hashSchema,
  documentsHash: hashSchema.optional(),
  rulesHash: hashSchema.optional(),
  criteriaHash: hashSchema.optional(),
  approvalPolicy: z.record(z.unknown()).optional(),
  publicationThreshold: z.coerce.number().int().min(2).max(5).optional()
});

const publicationRequestSchema = z.object({
  manifestId: z.string().min(1).optional()
});

const publicationApprovalSchema = z.object({
  manifestId: z.string().min(1).optional(),
  signatureHash: hashSchema,
  comments: z.string().max(1000).optional()
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

export const createTenderManifestController = asyncHandler(async (req: Request, res: Response) => {
  const payload = createManifestSchema.parse(req.body);
  const status = await createTenderManifest(
    {
      ...payload,
      approvalPolicy: payload.approvalPolicy as Prisma.InputJsonValue | undefined
    },
    requireUser(req),
    requestContext(req)
  );

  res.status(201).json(status);
});

export const getTenderManifestStatusController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const status = await getTenderManifestStatus(tenderId);

  res.json(status);
});

export const requestTenderPublicationController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const payload = publicationRequestSchema.parse(req.body);
  const status = await requestTenderPublication({ tenderId, manifestId: payload.manifestId }, requireUser(req), requestContext(req));

  res.json(status);
});

export const approveTenderPublicationController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const payload = publicationApprovalSchema.parse(req.body);
  const status = await approveTenderPublication(
    {
      tenderId,
      manifestId: payload.manifestId,
      signatureHash: payload.signatureHash,
      comments: payload.comments
    },
    requireUser(req),
    requestContext(req)
  );

  res.json(status);
});

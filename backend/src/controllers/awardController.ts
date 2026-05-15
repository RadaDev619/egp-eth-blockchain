import type { Request, Response } from "express";
import { z } from "zod";
import { approveAward, commitContractProofs, getAwardWorkspace, submitAwardRecommendation } from "../services/awardService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ValidationError } from "../utils/errors.js";

const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

const awardRecommendationSchema = z.object({
  evaluationReportId: z.string().min(1).optional(),
  recommendedVendorStakeholderId: z.string().min(1).optional(),
  recommendationHash: hashSchema
});

const awardApprovalSchema = z.object({
  signatureHash: hashSchema,
  comments: z.string().max(1000).optional()
});

const contractProofSchema = z.object({
  letterOfIntentHash: hashSchema.optional(),
  letterOfAcceptanceHash: hashSchema.optional(),
  contractHash: hashSchema.optional()
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

export const getAwardWorkspaceController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const workspace = await getAwardWorkspace(tenderId, requireUser(req), requestContext(req));

  res.json({ workspace });
});

export const submitAwardRecommendationController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const payload = awardRecommendationSchema.parse(req.body);
  const recommendation = await submitAwardRecommendation(
    {
      tenderId,
      evaluationReportId: payload.evaluationReportId,
      recommendedVendorStakeholderId: payload.recommendedVendorStakeholderId,
      recommendationHash: payload.recommendationHash
    },
    requireUser(req),
    requestContext(req)
  );

  res.status(201).json({ recommendation });
});

export const approveAwardController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const awardRecommendationId = z.string().min(1).parse(req.params.awardRecommendationId);
  const payload = awardApprovalSchema.parse(req.body);
  const result = await approveAward(
    {
      tenderId,
      awardRecommendationId,
      signatureHash: payload.signatureHash,
      comments: payload.comments
    },
    requireUser(req),
    requestContext(req)
  );

  res.status(201).json(result);
});

export const commitContractProofsController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const payload = contractProofSchema.parse(req.body);
  const result = await commitContractProofs(
    {
      tenderId,
      letterOfIntentHash: payload.letterOfIntentHash,
      letterOfAcceptanceHash: payload.letterOfAcceptanceHash,
      contractHash: payload.contractHash
    },
    requireUser(req),
    requestContext(req)
  );

  res.status(201).json(result);
});

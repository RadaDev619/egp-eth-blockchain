import type { Request, Response } from "express";
import { z } from "zod";
import {
  declareConflictOfInterest,
  finalizeEvaluationReport,
  getCommitteeDashboard,
  listTechnicalEnvelopesForCommittee,
  submitEvaluationReport
} from "../services/evaluationCommitteeService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ValidationError } from "../utils/errors.js";

const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

const conflictDeclarationSchema = z.object({
  declarationStatus: z.enum(["DECLARED_NO_CONFLICT", "DECLARED_CONFLICT", "REVIEW_REQUIRED"]),
  declarationHash: hashSchema
});

const evaluationReportSchema = z.object({
  reportHash: hashSchema,
  technicalScoreHash: hashSchema.optional(),
  financialScoreHash: hashSchema.optional()
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

export const getCommitteeDashboardController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const dashboard = await getCommitteeDashboard(tenderId, requireUser(req), requestContext(req));

  res.json({ dashboard });
});

export const declareConflictOfInterestController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const payload = conflictDeclarationSchema.parse(req.body);
  const declaration = await declareConflictOfInterest(
    {
      tenderId,
      declarationStatus: payload.declarationStatus,
      declarationHash: payload.declarationHash
    },
    requireUser(req),
    requestContext(req)
  );

  res.status(201).json({ declaration });
});

export const listTechnicalEnvelopesForCommitteeController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const envelopes = await listTechnicalEnvelopesForCommittee(tenderId, requireUser(req), requestContext(req));

  res.json({ envelopes });
});

export const submitEvaluationReportController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const payload = evaluationReportSchema.parse(req.body);
  const report = await submitEvaluationReport(
    {
      tenderId,
      reportHash: payload.reportHash,
      technicalScoreHash: payload.technicalScoreHash,
      financialScoreHash: payload.financialScoreHash
    },
    requireUser(req),
    requestContext(req)
  );

  res.status(201).json({ report });
});

export const finalizeEvaluationReportController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const reportId = z.string().min(1).parse(req.params.reportId);
  const report = await finalizeEvaluationReport({ tenderId, reportId }, requireUser(req), requestContext(req));

  res.json({ report });
});

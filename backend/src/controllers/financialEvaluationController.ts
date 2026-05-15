import type { Request, Response } from "express";
import { z } from "zod";
import {
  getFinancialEvaluationWorkspace,
  releaseFinancialEnvelopeKey,
  requestFinancialEnvelopeKeyRelease
} from "../services/financialEvaluationService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ValidationError } from "../utils/errors.js";

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

export const getFinancialEvaluationWorkspaceController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const workspace = await getFinancialEvaluationWorkspace(tenderId, requireUser(req), requestContext(req));

  res.json({ workspace });
});

export const requestFinancialEnvelopeKeyReleaseController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const proposalEnvelopeId = z.string().min(1).parse(req.params.proposalEnvelopeId);
  const result = await requestFinancialEnvelopeKeyRelease({ tenderId, proposalEnvelopeId }, requireUser(req), requestContext(req));

  res.status(201).json(result);
});

export const releaseFinancialEnvelopeKeyController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const keyReleaseRequestId = z.string().min(1).parse(req.params.keyReleaseRequestId);
  const result = await releaseFinancialEnvelopeKey({ tenderId, keyReleaseRequestId }, requireUser(req), requestContext(req));

  res.json(result);
});

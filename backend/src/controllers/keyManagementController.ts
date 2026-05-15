import type { Request, Response } from "express";
import { z } from "zod";
import { releaseEnvelopeKey, requestEnvelopeKeyRelease } from "../services/keyManagementService.js";
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

export const requestEnvelopeKeyReleaseController = asyncHandler(async (req: Request, res: Response) => {
  const proposalEnvelopeId = z.string().min(1).parse(req.params.proposalEnvelopeId);
  const result = await requestEnvelopeKeyRelease({ proposalEnvelopeId }, requireUser(req), requestContext(req));

  res.status(201).json(result);
});

export const releaseEnvelopeKeyController = asyncHandler(async (req: Request, res: Response) => {
  const keyReleaseRequestId = z.string().min(1).parse(req.params.keyReleaseRequestId);
  const result = await releaseEnvelopeKey({ keyReleaseRequestId }, requireUser(req), requestContext(req));

  res.json(result);
});

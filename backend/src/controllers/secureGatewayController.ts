import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  checkSecureGatewayAction,
  getSecureGatewayContext,
  listSecureGatewayPolicies,
  SecureGatewayAction
} from "../services/secureProcurementGateway.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ValidationError } from "../utils/errors.js";

const gatewayActionSchema = z.enum([
  SecureGatewayAction.CREATE_TENDER_MANIFEST,
  SecureGatewayAction.REQUEST_PUBLICATION_APPROVAL,
  SecureGatewayAction.APPROVE_TENDER_PUBLICATION,
  SecureGatewayAction.SUBMIT_PROPOSAL_PACKAGE,
  SecureGatewayAction.COMMIT_PROPOSAL_ENVELOPE,
  SecureGatewayAction.CLOSE_TENDER,
  SecureGatewayAction.REQUEST_KEY_RELEASE,
  SecureGatewayAction.RELEASE_ENVELOPE_KEY,
  SecureGatewayAction.DECLARE_CONFLICT_OF_INTEREST,
  SecureGatewayAction.SUBMIT_EVALUATION_REPORT,
  SecureGatewayAction.SUBMIT_AWARD_RECOMMENDATION,
  SecureGatewayAction.APPROVE_AWARD,
  SecureGatewayAction.COMMIT_CONTRACT_HASH,
  SecureGatewayAction.ARCHIVE_TENDER
]);

const policyCheckSchema = z.object({
  action: gatewayActionSchema,
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

export const listSecureGatewayPoliciesController = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ policies: listSecureGatewayPolicies() });
});

export const getSecureGatewayContextController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const context = await getSecureGatewayContext(tenderId, requireUser(req), requestContext(req));

  res.json({ context });
});

export const checkSecureGatewayActionController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const payload = policyCheckSchema.parse(req.body);
  const result = await checkSecureGatewayAction(
    {
      tenderId,
      action: payload.action,
      metadata: payload.metadata as Prisma.InputJsonValue | undefined
    },
    requireUser(req),
    requestContext(req)
  );

  res.json(result);
});

import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { assignTenderRole, listTenderAssignments, revokeTenderRole } from "../services/tenderAssignmentService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ValidationError } from "../utils/errors.js";

const roleSchema = z.enum([
  "PROCUREMENT_OFFICER",
  "VENDOR",
  "EVALUATOR",
  "FINANCE_OFFICER",
  "AUDITOR",
  "TEC_MEMBER",
  "TEC_CHAIR",
  "APPROVING_OFFICER",
  "FINANCIAL_INSTITUTION_OFFICER"
]);

const assignTenderRoleSchema = z.object({
  stakeholderId: z.string().min(1),
  role: roleSchema,
  metadata: z.record(z.unknown()).optional()
});

const revokeTenderRoleSchema = z.object({
  reason: z.string().max(500).optional()
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

export const listTenderAssignmentsController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const assignments = await listTenderAssignments(tenderId, requireUser(req), requestContext(req));

  res.json({ assignments });
});

export const assignTenderRoleController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const payload = assignTenderRoleSchema.parse(req.body);
  const assignment = await assignTenderRole(
    {
      tenderId,
      stakeholderId: payload.stakeholderId,
      role: payload.role,
      metadata: payload.metadata as Prisma.InputJsonValue | undefined
    },
    requireUser(req),
    requestContext(req)
  );

  res.status(201).json({ assignment });
});

export const revokeTenderRoleController = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const assignmentId = z.string().min(1).parse(req.params.assignmentId);
  const payload = revokeTenderRoleSchema.parse(req.body);
  const assignment = await revokeTenderRole({ tenderId, assignmentId, reason: payload.reason }, requireUser(req), requestContext(req));

  res.json({ assignment });
});

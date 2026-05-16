import type { Request, Response } from "express";
import { z } from "zod";
import { getAuditTimeline, getAuditTransactionProof, getTenderAuditTimeline } from "../services/auditService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const auditQuerySchema = z.object({
  tenderId: z.string().optional(),
  action: z.string().optional(),
  status: z.enum([
    "SUCCESS",
    "BLOCKED",
    "FAILED",
    "PENDING_CHAIN_CONFIRMATION",
    "CHAIN_CONFIRMED",
    "CHAIN_FAILED",
    "MOCK_CHAIN_CONFIRMED"
  ]).optional(),
  actorRole: z
    .enum([
      "PROCUREMENT_OFFICER",
      "VENDOR",
      "EVALUATOR",
      "FINANCE_OFFICER",
      "AUDITOR",
      "TEC_MEMBER",
      "TEC_CHAIR",
      "APPROVING_OFFICER",
      "FINANCIAL_INSTITUTION_OFFICER"
    ])
    .optional(),
  actorEmployeeHash: z.string().optional(),
  txHash: z.string().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional()
});

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const filters = auditQuerySchema.parse(req.query);
  const timeline = await getAuditTimeline(filters);

  res.json({ timeline, logs: timeline });
});

export const getTenderTimeline = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const timeline = await getTenderAuditTimeline(tenderId);

  res.json(timeline);
});

export const getTxAuditProof = asyncHandler(async (req: Request, res: Response) => {
  const txHash = z.string().min(1).parse(req.params.txHash);
  const proof = await getAuditTransactionProof(txHash);

  res.json(proof);
});

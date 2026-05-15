import type { Request, Response } from "express";
import { z } from "zod";
import {
  getPublicAuditOverview,
  getPublicTenderAudit,
  getPublicTransactionAudit
} from "../services/publicAuditService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const publicAuditQuerySchema = z.object({
  tenderId: z.string().min(1).optional(),
  proofType: z
    .enum([
      "TENDER_MANIFEST",
      "PROPOSAL_PACKAGE",
      "ENVELOPE_COMMITMENT",
      "KEY_RELEASE",
      "EVALUATION_REPORT",
      "AWARD_RECOMMENDATION",
      "AWARD_APPROVAL",
      "CONTRACT_HASH",
      "TAMPERING_DETECTED"
    ])
    .optional(),
  txHash: z.string().min(1).optional()
});

export const listPublicAudit = asyncHandler(async (req: Request, res: Response) => {
  const filters = publicAuditQuerySchema.parse(req.query);
  const result = await getPublicAuditOverview(filters);

  res.json(result);
});

export const getPublicTenderTimeline = asyncHandler(async (req: Request, res: Response) => {
  const tenderId = z.string().min(1).parse(req.params.tenderId);
  const result = await getPublicTenderAudit(tenderId);

  res.json(result);
});

export const getPublicTxProof = asyncHandler(async (req: Request, res: Response) => {
  const txHash = z.string().min(1).parse(req.params.txHash);
  const result = await getPublicTransactionAudit(txHash);

  res.json(result);
});

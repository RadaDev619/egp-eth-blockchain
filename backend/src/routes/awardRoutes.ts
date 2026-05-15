import { Router } from "express";
import {
  approveAwardController,
  commitContractProofsController,
  getAwardWorkspaceController,
  submitAwardRecommendationController
} from "../controllers/awardController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { permissions } from "../types/domain.js";

export const awardRoutes = Router();

awardRoutes.use(authMiddleware);

awardRoutes.get(
  "/gateway/tenders/:tenderId/award",
  requirePermission(permissions.VIEW_ASSIGNED_TENDERS, "VIEW_AWARD_WORKSPACE"),
  getAwardWorkspaceController
);

awardRoutes.post(
  "/gateway/tenders/:tenderId/award/recommendations",
  requirePermission(permissions.SUBMIT_AWARD_RECOMMENDATION, "SUBMIT_AWARD_RECOMMENDATION"),
  submitAwardRecommendationController
);

awardRoutes.post(
  "/gateway/tenders/:tenderId/award/recommendations/:awardRecommendationId/approvals",
  requirePermission(permissions.APPROVE_AWARD, "APPROVE_AWARD"),
  approveAwardController
);

awardRoutes.post(
  "/gateway/tenders/:tenderId/award/contract-proofs",
  requirePermission(permissions.COMMIT_CONTRACT_HASH, "COMMIT_CONTRACT_HASH"),
  commitContractProofsController
);

import { Router } from "express";
import {
  getFinancialEvaluationWorkspaceController,
  releaseFinancialEnvelopeKeyController,
  requestFinancialEnvelopeKeyReleaseController
} from "../controllers/financialEvaluationController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { permissions } from "../types/domain.js";

export const financialEvaluationRoutes = Router();

financialEvaluationRoutes.use(authMiddleware);

financialEvaluationRoutes.get(
  "/gateway/tenders/:tenderId/financial-evaluation",
  requirePermission(permissions.REQUEST_KEY_RELEASE, "VIEW_FINANCIAL_EVALUATION"),
  getFinancialEvaluationWorkspaceController
);

financialEvaluationRoutes.post(
  "/gateway/tenders/:tenderId/financial-evaluation/envelopes/:proposalEnvelopeId/key-release/request",
  requirePermission(permissions.REQUEST_KEY_RELEASE, "REQUEST_FINANCIAL_KEY_RELEASE"),
  requestFinancialEnvelopeKeyReleaseController
);

financialEvaluationRoutes.post(
  "/gateway/tenders/:tenderId/financial-evaluation/key-release-requests/:keyReleaseRequestId/release",
  requirePermission(permissions.RELEASE_ENVELOPE_KEY, "RELEASE_FINANCIAL_ENVELOPE_KEY"),
  releaseFinancialEnvelopeKeyController
);

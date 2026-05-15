import { Router } from "express";
import {
  declareConflictOfInterestController,
  finalizeEvaluationReportController,
  getCommitteeDashboardController,
  listTechnicalEnvelopesForCommitteeController,
  submitEvaluationReportController
} from "../controllers/evaluationCommitteeController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { permissions } from "../types/domain.js";

export const evaluationCommitteeRoutes = Router();

evaluationCommitteeRoutes.use(authMiddleware);

evaluationCommitteeRoutes.get(
  "/gateway/tenders/:tenderId/committee",
  requirePermission(permissions.VIEW_ASSIGNED_TENDERS, "VIEW_COMMITTEE_DASHBOARD"),
  getCommitteeDashboardController
);

evaluationCommitteeRoutes.post(
  "/gateway/tenders/:tenderId/committee/conflict-declarations",
  requirePermission(permissions.DECLARE_CONFLICT_OF_INTEREST, "DECLARE_CONFLICT_OF_INTEREST"),
  declareConflictOfInterestController
);

evaluationCommitteeRoutes.get(
  "/gateway/tenders/:tenderId/committee/technical-envelopes",
  requirePermission(permissions.REQUEST_KEY_RELEASE, "VIEW_TECHNICAL_ENVELOPES"),
  listTechnicalEnvelopesForCommitteeController
);

evaluationCommitteeRoutes.post(
  "/gateway/tenders/:tenderId/committee/evaluation-reports",
  requirePermission(permissions.SUBMIT_EVALUATION_REPORT, "SUBMIT_EVALUATION_REPORT"),
  submitEvaluationReportController
);

evaluationCommitteeRoutes.post(
  "/gateway/tenders/:tenderId/committee/evaluation-reports/:reportId/finalize",
  requirePermission(permissions.SUBMIT_EVALUATION_REPORT, "FINALIZE_EVALUATION_REPORT"),
  finalizeEvaluationReportController
);

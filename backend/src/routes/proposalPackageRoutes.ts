import { Router } from "express";
import {
  commitProposalEnvelopeController,
  getProposalPackageController,
  listProposalPackagesController,
  submitProposalPackageController
} from "../controllers/proposalPackageController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { permissions } from "../types/domain.js";

export const proposalPackageRoutes = Router();

proposalPackageRoutes.use(authMiddleware);

proposalPackageRoutes.get("/gateway/tenders/:tenderId/proposals", listProposalPackagesController);
proposalPackageRoutes.post(
  "/gateway/tenders/:tenderId/proposals",
  requirePermission(permissions.SUBMIT_PROPOSAL_PACKAGE, "SUBMIT_PROPOSAL_PACKAGE"),
  submitProposalPackageController
);
proposalPackageRoutes.get("/gateway/proposals/:proposalPackageId", getProposalPackageController);
proposalPackageRoutes.post(
  "/gateway/proposals/:proposalPackageId/envelopes",
  requirePermission(permissions.COMMIT_PROPOSAL_ENVELOPE, "COMMIT_PROPOSAL_ENVELOPE"),
  commitProposalEnvelopeController
);

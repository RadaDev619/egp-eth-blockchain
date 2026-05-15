import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import {
  commitProposalEnvelopeController,
  getProposalPackageController,
  listProposalPackagesController,
  submitProposalPackageController,
  uploadEncryptedProposalEnvelopeController
} from "../controllers/proposalPackageController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { permissions } from "../types/domain.js";
import { ValidationError } from "../utils/errors.js";
import { MAX_ENCRYPTED_PROPOSAL_UPLOAD_BYTES } from "../utils/encryptedProposalFile.js";

export const proposalPackageRoutes = Router();

const encryptedUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ENCRYPTED_PROPOSAL_UPLOAD_BYTES,
    files: 1
  }
});

function encryptedProposalUpload(req: Request, res: Response, next: NextFunction) {
  encryptedUpload.single("encryptedFile")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      next(
        new ValidationError("Encrypted proposal upload is invalid.", {
          field: "encryptedFile",
          code: error.code,
          maxBytes: MAX_ENCRYPTED_PROPOSAL_UPLOAD_BYTES
        })
      );
      return;
    }

    next(error);
  });
}

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
proposalPackageRoutes.post(
  "/gateway/proposals/:proposalPackageId/envelopes/upload",
  requirePermission(permissions.COMMIT_PROPOSAL_ENVELOPE, "COMMIT_PROPOSAL_ENVELOPE"),
  encryptedProposalUpload,
  uploadEncryptedProposalEnvelopeController
);

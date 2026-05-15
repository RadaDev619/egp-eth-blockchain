import { Router } from "express";
import {
  approveTenderPublicationController,
  createTenderManifestController,
  getTenderManifestStatusController,
  requestTenderPublicationController
} from "../controllers/tenderManifestController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { permissions } from "../types/domain.js";

export const tenderManifestRoutes = Router();

tenderManifestRoutes.use(authMiddleware);

tenderManifestRoutes.post(
  "/gateway/tenders/manifest",
  requirePermission(permissions.CREATE_TENDER_MANIFEST, "CREATE_TENDER_MANIFEST"),
  createTenderManifestController
);
tenderManifestRoutes.get("/gateway/tenders/:tenderId/manifest", getTenderManifestStatusController);
tenderManifestRoutes.post(
  "/gateway/tenders/:tenderId/publication/request",
  requirePermission(permissions.REQUEST_PUBLICATION_APPROVAL, "REQUEST_PUBLICATION_APPROVAL"),
  requestTenderPublicationController
);
tenderManifestRoutes.post(
  "/gateway/tenders/:tenderId/publication/approve",
  requirePermission(permissions.APPROVE_TENDER_PUBLICATION, "APPROVE_TENDER_PUBLICATION"),
  approveTenderPublicationController
);
